# PantryGrid

PantryGrid is a hackathon MVP for finding food banks near any city, ZIP code, or address in the United States. It geocodes the search, looks up nearby organizations in a checked-in national database, and displays organization details and simulated food inventory on an interactive map.

# Authors

Luis Ibarra, Aarav Mishra, Ant Hussein


## Run locally

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). For a production build:

```bash
npm run build
npm start
```

## Data services

- [OpenStreetMap Nominatim](https://nominatim.org/) converts a U.S. location search to coordinates.
- [OpenStreetMap tiles](https://www.openstreetmap.org/) provide the basemap through Leaflet.
- `data/food-banks.json` contains 7,026 IRS/NCCS NTEE K31 food-bank and pantry records.
- `data/food-items.json` contains a 2,500-item catalog used for simulated inventories.

Location lookup and database queries run through server-side Next.js API routes. Selecting a bank calls `/api/food-banks/[id]/inventory`, which creates a deterministic random assortment scaled by the bank's size classification. Large banks receive more distinct items and units than Medium, Small, or Unknown-size banks.

To regenerate the runtime JSON after changing the CSV sources:

```bash
node scripts/generate-data.mjs
```

## Important limitations

The directory is based on IRS/NCCS nonprofit records, not a real-time service-location feed. Records may be historical, may represent legal entities instead of individual distribution sites, and do not include verified hours or contact details. PantryGrid must not be treated as an authoritative emergency-services directory.

Inventory is simulated from the catalog for demonstration purposes and does not represent actual availability. A production version would need verified location data, real inventory feeds, caching, and rate limiting.

## Local catalog database

The branch also includes a local SQLite catalog and import scripts. The frontend runtime uses the generated JSON assets described above, while the SQLite file provides a queryable local copy of the reference data.

Rebuild the catalog from the source workbook with Python 3:

```bash
python3 scripts/import-food-items.py /path/to/2500_food_bank_food_items.xlsx
```

The importer validates required fields, duplicate IDs and names, and category totals before atomically replacing `data/food-items.sqlite`.

Import the food-bank directory into the same database:

```bash
python3 scripts/import-food-banks.py /path/to/us_food_bank_master_directory.xlsx
```

The directory importer validates unique EINs, coordinate pairs, size and activity classifications, and state totals. Records without coordinates remain in the database with null coordinates rather than receiving fabricated locations.
