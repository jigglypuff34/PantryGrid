#!/usr/bin/env python3
"""Import PantryGrid's U.S. food-bank directory into the local SQLite database."""

import argparse
import re
import sqlite3
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

XML_NAMESPACE = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RELATIONSHIP_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REQUIRED_COLUMNS = {
    "source", "source_record_id", "ein", "organization_name", "dba_name", "street",
    "city", "state", "zip", "county", "latitude", "longitude", "ntee_code",
    "ntee_definition", "status_code", "status_definition", "last_seen_vintage",
    "tax_period", "revenue_amount", "asset_amount", "income_amount", "size",
    "size_basis", "active_flag", "source_url",
}
VALID_SIZES = {"Large", "Medium", "Small", "Unknown"}
VALID_ACTIVE_FLAGS = {"Yes", "Likely", "Unknown/Inactive"}


def column_name(cell_reference: str) -> str:
    match = re.match(r"[A-Z]+", cell_reference)
    if not match:
        raise ValueError(f"Invalid cell reference: {cell_reference}")
    return match.group(0)


def read_workbook(path: Path) -> dict[str, list[dict[str, str]]]:
    with zipfile.ZipFile(path) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(node.text or "" for node in item.findall(".//m:t", XML_NAMESPACE))
                for item in root.findall("m:si", XML_NAMESPACE)
            ]

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {relationship.attrib["Id"]: relationship.attrib["Target"] for relationship in relationships}
        sheets: dict[str, list[dict[str, str]]] = {}

        for sheet in workbook.findall(".//m:sheet", XML_NAMESPACE):
            relationship_id = sheet.attrib[f"{{{RELATIONSHIP_NAMESPACE}}}id"]
            target = targets[relationship_id].lstrip("/")
            sheet_path = target if target.startswith("xl/") else f"xl/{target}"
            sheet_root = ET.fromstring(archive.read(sheet_path))
            raw_rows: list[dict[str, str]] = []
            for row in sheet_root.findall(".//m:sheetData/m:row", XML_NAMESPACE):
                values: dict[str, str] = {}
                for cell in row.findall("m:c", XML_NAMESPACE):
                    column = column_name(cell.attrib["r"])
                    value_node = cell.find("m:v", XML_NAMESPACE)
                    value = "" if value_node is None else value_node.text or ""
                    if cell.attrib.get("t") == "s" and value:
                        value = shared_strings[int(value)]
                    elif cell.attrib.get("t") == "inlineStr":
                        value = "".join(node.text or "" for node in cell.findall(".//m:t", XML_NAMESPACE))
                    values[column] = value.strip()
                raw_rows.append(values)

            if not raw_rows:
                sheets[sheet.attrib["name"]] = []
                continue
            headers = raw_rows[0]
            sheets[sheet.attrib["name"]] = [
                {header: row.get(column, "") for column, header in headers.items()}
                for row in raw_rows[1:]
            ]
        return sheets


def optional_float(value: str) -> float | None:
    return float(value) if value else None


def optional_integer(value: str) -> int | None:
    return round(float(value)) if value else None


def optional_text(value: str) -> str | None:
    return value or None


def validate_directory(sheets: dict[str, list[dict[str, str]]]) -> list[dict[str, str]]:
    if "Master Directory" not in sheets:
        raise ValueError("Workbook is missing the 'Master Directory' sheet")
    records = sheets["Master Directory"]
    if not records:
        raise ValueError("Master Directory contains no records")
    missing_columns = REQUIRED_COLUMNS - set(records[0])
    if missing_columns:
        raise ValueError(f"Master Directory is missing columns: {sorted(missing_columns)}")

    seen_eins: set[str] = set()
    for row_number, record in enumerate(records, start=2):
        if not record["ein"] or not record["organization_name"] or not record["state"]:
            raise ValueError(f"Master Directory row {row_number} is missing an EIN, name, or state")
        if record["ein"] in seen_eins:
            raise ValueError(f"Duplicate EIN: {record['ein']}")
        if bool(record["latitude"]) != bool(record["longitude"]):
            raise ValueError(f"Master Directory row {row_number} has a partial coordinate pair")
        if record["size"] not in VALID_SIZES:
            raise ValueError(f"Master Directory row {row_number} has an invalid size")
        if record["active_flag"] not in VALID_ACTIVE_FLAGS:
            raise ValueError(f"Master Directory row {row_number} has an invalid active flag")
        if record["latitude"]:
            latitude = float(record["latitude"])
            longitude = float(record["longitude"])
            if not 18 <= latitude <= 72 or not -180 <= longitude <= -65:
                raise ValueError(f"Master Directory row {row_number} has coordinates outside the U.S.")
        seen_eins.add(record["ein"])

    if "State Summary" in sheets:
        expected = {row["Code"]: int(row["Total Records"]) for row in sheets["State Summary"]}
        actual = Counter(record["state"] for record in records)
        if actual != expected:
            raise ValueError("State Summary does not match the Master Directory")
    return records


def import_records(records: list[dict[str, str]], database_path: Path) -> None:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("BEGIN IMMEDIATE")
        connection.executescript(
            """
            DROP TABLE IF EXISTS food_banks;

            CREATE TABLE food_banks (
                id INTEGER PRIMARY KEY,
                source TEXT NOT NULL,
                source_record_id TEXT NOT NULL UNIQUE,
                ein TEXT NOT NULL UNIQUE,
                organization_name TEXT NOT NULL,
                dba_name TEXT,
                street TEXT,
                city TEXT,
                state TEXT NOT NULL,
                zip TEXT,
                county TEXT,
                latitude REAL,
                longitude REAL,
                ntee_code TEXT,
                ntee_definition TEXT,
                status_code TEXT,
                status_definition TEXT,
                last_seen_vintage TEXT,
                tax_period TEXT,
                revenue_amount INTEGER,
                asset_amount INTEGER,
                income_amount INTEGER,
                size TEXT NOT NULL CHECK(size IN ('Large', 'Medium', 'Small', 'Unknown')),
                size_basis TEXT NOT NULL,
                active_flag TEXT NOT NULL CHECK(active_flag IN ('Yes', 'Likely', 'Unknown/Inactive')),
                source_url TEXT NOT NULL,
                CHECK((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))
            );

            CREATE INDEX food_banks_location_idx ON food_banks(latitude, longitude);
            CREATE INDEX food_banks_state_idx ON food_banks(state);
            CREATE INDEX food_banks_size_idx ON food_banks(size);
            CREATE INDEX food_banks_active_flag_idx ON food_banks(active_flag);
            """
        )
        connection.executemany(
            """
            INSERT INTO food_banks(
                source, source_record_id, ein, organization_name, dba_name, street, city,
                state, zip, county, latitude, longitude, ntee_code, ntee_definition,
                status_code, status_definition, last_seen_vintage, tax_period,
                revenue_amount, asset_amount, income_amount, size, size_basis,
                active_flag, source_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                (
                    record["source"], record["source_record_id"], record["ein"],
                    record["organization_name"], optional_text(record["dba_name"]),
                    optional_text(record["street"]), optional_text(record["city"]), record["state"],
                    optional_text(record["zip"]), optional_text(record["county"]),
                    optional_float(record["latitude"]), optional_float(record["longitude"]),
                    optional_text(record["ntee_code"]), optional_text(record["ntee_definition"]),
                    optional_text(record["status_code"]), optional_text(record["status_definition"]),
                    optional_text(record["last_seen_vintage"]), optional_text(record["tax_period"]),
                    optional_integer(record["revenue_amount"]), optional_integer(record["asset_amount"]),
                    optional_integer(record["income_amount"]), record["size"], record["size_basis"],
                    record["active_flag"], record["source_url"],
                )
                for record in records
            ),
        )
        connection.execute("PRAGMA user_version = 2")
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise ValueError(f"SQLite integrity check failed: {integrity}")
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path, help="Path to the source .xlsx workbook")
    parser.add_argument(
        "--database",
        type=Path,
        default=Path("data/food-items.sqlite"),
        help="SQLite database path (default: data/food-items.sqlite)",
    )
    arguments = parser.parse_args()
    records = validate_directory(read_workbook(arguments.workbook))
    import_records(records, arguments.database)
    print(f"Imported {len(records)} food-bank records into {arguments.database}")


if __name__ == "__main__":
    main()
