import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(repositoryRoot, "data", "source");
const databaseSource = path.join(sourceDirectory, "us_food_bank_master_directory_irs_k31_2026-07-16.csv");
const foodCatalogSource = path.join(sourceDirectory, "2500_food_bank_food_items.csv");

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readObjects(csv) {
  const [rawHeaders, ...rows] = parseCsv(csv);
  const headers = rawHeaders.map((header) => header.replace(/^\uFEFF/, ""));
  return rows
    .filter((row) => row.some(Boolean))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function optional(value) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSize(value) {
  return ["Large", "Medium", "Small"].includes(value) ? value : "Unknown";
}

function buildAddress(record) {
  const locality = [record.city, record.state, record.zip].filter(Boolean).join(", ");
  return [record.street, locality].filter(Boolean).join(", ");
}

const bankRows = readObjects(await fs.readFile(databaseSource, "utf8"));
const banks = bankRows
  .map((record) => ({
    id: record.source_record_id || record.ein,
    ein: record.ein,
    name: record.organization_name || record.dba_name || "Unnamed food bank",
    dbaName: optional(record.dba_name),
    latitude: Number(record.latitude),
    longitude: Number(record.longitude),
    address: buildAddress(record),
    city: record.city,
    state: record.state,
    zip: record.zip,
    county: optional(record.county),
    size: normalizeSize(record.size),
    sizeBasis: record.size_basis,
    revenueAmount: amount(record.revenue_amount),
    assetAmount: amount(record.asset_amount),
    incomeAmount: amount(record.income_amount),
    active: record.active_flag,
    taxPeriod: optional(record.tax_period),
    sourceUrl: record.source_url,
  }))
  .filter((bank) => bank.id && Number.isFinite(bank.latitude) && Number.isFinite(bank.longitude));

const itemRows = readObjects(await fs.readFile(foodCatalogSource, "utf8"));
const foodItems = itemRows.map((record) => ({
  id: Number(record.ID),
  name: record["Food Item"],
  category: record.Category,
  storageType: record["Storage Type"],
  dietaryNotes: optional(record["Dietary Notes"]),
}));

await Promise.all([
  fs.writeFile(path.join(repositoryRoot, "data", "food-banks.json"), `${JSON.stringify({
    generatedOn: "2026-07-16",
    source: path.basename(databaseSource),
    recordCount: banks.length,
    records: banks,
  })}\n`),
  fs.writeFile(path.join(repositoryRoot, "data", "food-items.json"), `${JSON.stringify({
    generatedOn: "2026-07-16",
    source: path.basename(foodCatalogSource),
    recordCount: foodItems.length,
    records: foodItems,
  })}\n`),
]);

console.log(`Generated ${banks.length} food-bank records and ${foodItems.length} food items.`);
