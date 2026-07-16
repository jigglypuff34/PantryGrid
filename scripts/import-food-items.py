#!/usr/bin/env python3
"""Import PantryGrid's food catalog workbook into a normalized SQLite database."""

import argparse
import re
import sqlite3
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

XML_NAMESPACE = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RELATIONSHIP_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REQUIRED_COLUMNS = {"ID", "Food Item", "Category", "Storage Type", "Dietary Notes"}


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


def validate_catalog(sheets: dict[str, list[dict[str, str]]]) -> list[dict[str, str]]:
    if "Food Catalog" not in sheets:
        raise ValueError("Workbook is missing the 'Food Catalog' sheet")

    items = sheets["Food Catalog"]
    if not items:
        raise ValueError("Food Catalog contains no items")
    missing_columns = REQUIRED_COLUMNS - set(items[0])
    if missing_columns:
        raise ValueError(f"Food Catalog is missing columns: {sorted(missing_columns)}")

    seen_ids: set[int] = set()
    seen_names: set[str] = set()
    for row_number, item in enumerate(items, start=2):
        if any(not item[column] for column in REQUIRED_COLUMNS):
            raise ValueError(f"Food Catalog row {row_number} contains a blank required value")
        try:
            item_id = int(item["ID"])
        except ValueError as error:
            raise ValueError(f"Food Catalog row {row_number} has an invalid ID") from error
        normalized_name = item["Food Item"].casefold()
        if item_id in seen_ids:
            raise ValueError(f"Duplicate food item ID: {item_id}")
        if normalized_name in seen_names:
            raise ValueError(f"Duplicate food item name: {item['Food Item']}")
        seen_ids.add(item_id)
        seen_names.add(normalized_name)

    if "Category Summary" in sheets:
        expected_counts = {
            row["Category"]: int(row["Item Count"])
            for row in sheets["Category Summary"]
        }
        actual_counts = Counter(item["Category"] for item in items)
        if actual_counts != expected_counts:
            raise ValueError("Category Summary does not match the Food Catalog")

    return items


def build_database(items: list[dict[str, str]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output_path.parent, suffix=".sqlite", delete=False) as temporary:
        temporary_path = Path(temporary.name)

    try:
        connection = sqlite3.connect(temporary_path)
        connection.executescript(
            """
            PRAGMA foreign_keys = ON;

            CREATE TABLE categories (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE
            );

            CREATE TABLE food_items (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                category_id INTEGER NOT NULL REFERENCES categories(id),
                storage_type TEXT NOT NULL,
                dietary_notes TEXT NOT NULL
            );

            CREATE INDEX food_items_category_idx ON food_items(category_id);
            CREATE INDEX food_items_storage_type_idx ON food_items(storage_type);
            """
        )

        categories = sorted({item["Category"] for item in items})
        connection.executemany("INSERT INTO categories(name) VALUES (?)", ((category,) for category in categories))
        category_ids = dict(connection.execute("SELECT name, id FROM categories"))
        connection.executemany(
            """
            INSERT INTO food_items(id, name, category_id, storage_type, dietary_notes)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                (
                    int(item["ID"]),
                    item["Food Item"],
                    category_ids[item["Category"]],
                    item["Storage Type"],
                    item["Dietary Notes"],
                )
                for item in items
            ),
        )
        connection.execute("PRAGMA user_version = 1")
        connection.commit()

        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise ValueError(f"SQLite integrity check failed: {integrity}")
        connection.close()
        temporary_path.replace(output_path)
    finally:
        temporary_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path, help="Path to the source .xlsx workbook")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/food-items.sqlite"),
        help="SQLite output path (default: data/food-items.sqlite)",
    )
    arguments = parser.parse_args()

    sheets = read_workbook(arguments.workbook)
    items = validate_catalog(sheets)
    build_database(items, arguments.output)
    print(f"Imported {len(items)} food items into {arguments.output}")


if __name__ == "__main__":
    main()
