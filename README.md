# PantryGrid

PantryGrid is a hackathon MVP for finding food banks near any city, ZIP code, or address in the United States. It geocodes the search, looks up community-mapped food banks within a selected radius, and displays the results on an interactive map.

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
- [OpenStreetMap Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) returns nearby features tagged `social_facility=food_bank`.
- [OpenStreetMap tiles](https://www.openstreetmap.org/) provide the basemap through Leaflet.

All Nominatim and Overpass requests run through server-side Next.js API routes. The browser never calls those services directly.

## Important limitations

OpenStreetMap is community-maintained, so food-bank listings, hours, and contact details may be missing or out of date. PantryGrid must not be treated as an authoritative emergency-services directory. Confirm availability directly with each organization.

The public APIs used here are appropriate for a prototype. A production version would need caching, rate limiting, stronger data sources, and its own maintained facility database.

## Local catalog database

The prototype includes a local SQLite database with a food-item catalog and a U.S. food-bank master directory. It contains reference data only; food items are not yet assigned to individual food banks and no quantities are simulated.

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
