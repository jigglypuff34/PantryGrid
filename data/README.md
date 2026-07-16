# PantryGrid data

Runtime data is generated from the source workbooks and CSV in `data/source`.

- `food-banks.json` contains 7,026 IRS/NCCS NTEE K31 food-bank and pantry records with coordinates, financial data, activity status, and the source-provided size classification.
- `food-items.json` contains the 2,500-item food catalog used to create sample inventories.
- `source/` preserves the original supplied files. `2500_food_bank_food_items.csv` is a faithful CSV extraction of the workbook's **Food Catalog** sheet for reproducible builds.

Run `node scripts/generate-data.mjs` after updating the CSV sources.

The database classifies positive-revenue organizations below $5 million as Small, $5 million to $25 million as Medium, and above $25 million as Large. Records without positive IRS revenue are Unknown. Inventory shown in the interface is simulated; it is not a statement of real-time availability.
