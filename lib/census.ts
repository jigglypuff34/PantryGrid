type CensusGeography = {
  GEOID?: string;
  state?: string;
  county?: string;
  tract?: string;
};

type CensusGeoResponse = {
  result?: {
    geographies?: Record<string, CensusGeography[] | undefined>;
  };
};

const surroundingPopulationCache = new Map<string, Promise<number | null>>();

function cacheKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

function getTractGeography(response: CensusGeoResponse): CensusGeography | null {
  const geographies = response.result?.geographies ?? {};
  const candidates = [
    geographies["Census Tracts"],
    geographies["Census Tract"],
    geographies["2020 Census Tracts"],
  ].find((value): value is CensusGeography[] => Array.isArray(value) && value.length > 0);

  return candidates?.[0] ?? null;
}

async function fetchTractPopulation(latitude: number, longitude: number): Promise<number | null> {
  const geoParams = new URLSearchParams({
    x: String(longitude),
    y: String(latitude),
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    layers: "Census Tracts",
    format: "json",
  });

  const geoResponse = await fetch(`https://geocoding.geo.census.gov/geocoder/geographies/coordinates?${geoParams}`, {
    cache: "no-store",
  });
  if (!geoResponse.ok) return null;

  const geoData = (await geoResponse.json()) as CensusGeoResponse;
  const tract = getTractGeography(geoData);
  if (!tract?.state || !tract?.county || !tract?.tract) return null;

  const populationParams = new URLSearchParams({
    get: "B01003_001E",
    for: `tract:${tract.tract}`,
  });

  populationParams.append("in", `state:${tract.state}`);
  populationParams.append("in", `county:${tract.county}`);

  const populationResponse = await fetch(`https://api.census.gov/data/2023/acs/acs5?${populationParams.toString()}`, {
    cache: "no-store",
  });
  if (!populationResponse.ok) return null;

  const rows = (await populationResponse.json()) as Array<Array<string | undefined>>;
  const value = Number(rows?.[1]?.[0]);
  return Number.isFinite(value) ? value : null;
}

export function getSurroundingPopulation(latitude: number, longitude: number) {
  const key = cacheKey(latitude, longitude);
  const existing = surroundingPopulationCache.get(key);
  if (existing) return existing;

  const request = fetchTractPopulation(latitude, longitude).catch(() => null);
  surroundingPopulationCache.set(key, request);
  return request;
}