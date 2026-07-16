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
