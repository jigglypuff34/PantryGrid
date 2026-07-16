import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { normalizeFoodBanks } from "@/lib/osm";
import { distanceInMiles } from "@/lib/distance";
import type { FoodBank } from "@/lib/types";
import { calculateSupplyPercent, deriveSupplyLevel, estimateBankSizeThousands } from "@/lib/supply";
import { getSurroundingPopulation } from "@/lib/census";

const USER_AGENT = "PantryGrid-Hackathon-MVP/1.0 (+https://github.com/pantrygrid)";
const ALLOWED_RADII = new Set([25, 50, 75]);
const FOOD_BANK_CACHE_SCHEMA = "v4";
const FOOD_BANK_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_IN_FLIGHT = 100;
const OVERPASS_ENDPOINTS = [
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const ENDPOINT_TIMEOUT_MS = 15_000;

type OverpassData = { elements: Parameters<typeof normalizeFoodBanks>[0] };
type CachedFoodBanks = { foodBanks: FoodBank[]; cachedAt: number };

const inFlightFoodBanks = new Map<string, Promise<CachedFoodBanks>>();

function logDevelopment(message: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "development") console.info(`[PantryGrid] ${message}`, details);
}

async function queryOverpassAttempt(query: string): Promise<OverpassData> {
  const controllers = OVERPASS_ENDPOINTS.map(() => new AbortController());
  const requests = OVERPASS_ENDPOINTS.map(async (endpoint, index) => {
    const timeout = setTimeout(() => controllers[index].abort(), ENDPOINT_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        body: new URLSearchParams({ data: query }),
        cache: "no-store",
        signal: controllers[index].signal,
      });
      if (!response.ok) throw new Error(`Overpass returned ${response.status}`);

      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || !Array.isArray((data as { elements?: unknown }).elements)) {
        throw new Error("Overpass returned malformed data");
      }
      return data as OverpassData;
    } finally {
      clearTimeout(timeout);
    }
  });

  try {
    return await Promise.any(requests);
  } finally {
    controllers.forEach((controller) => controller.abort());
  }
}

async function queryOverpass(query: string): Promise<OverpassData> {
  try {
    return await queryOverpassAttempt(query);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return queryOverpassAttempt(query);
  }
}

const getCachedFoodBanks = unstable_cache(
  async (latitude: number, longitude: number, radiusMiles: number): Promise<CachedFoodBanks> => {
    const startedAt = Date.now();
    const latitudeDelta = radiusMiles / 69;
    const longitudeDelta = radiusMiles / (69 * Math.cos(latitude * Math.PI / 180));
    const bounds = [
      latitude - latitudeDelta,
      longitude - longitudeDelta,
      latitude + latitudeDelta,
      longitude + longitudeDelta,
    ].map((coordinate) => coordinate.toFixed(6)).join(",");
    const query = `[out:json][timeout:25];\n(\n  nwr["social_facility"="food_bank"](${bounds});\n);\nout center tags qt;`;

    try {
      const data = await queryOverpass(query);
      const surroundingPopulation = await getSurroundingPopulation(latitude, longitude);
      const foodBanks = normalizeFoodBanks(data.elements)
        .filter((foodBank) => distanceInMiles({ latitude, longitude }, foodBank) <= radiusMiles)
        .map((foodBank) => {
          const supplyPoundsThousands = estimateBankSizeThousands(foodBank);
          const supplyPercent = calculateSupplyPercent(supplyPoundsThousands, surroundingPopulation);
          return {
            ...foodBank,
            supplyPoundsThousands,
            supplyPercent,
            supplyLevel: deriveSupplyLevel(supplyPercent),
          };
        });
      return { foodBanks, cachedAt: Date.now() };
    } finally {
      logDevelopment("Overpass requested", {
        key: ["food-banks", FOOD_BANK_CACHE_SCHEMA, latitude, longitude, radiusMiles].join(":"),
        durationMs: Date.now() - startedAt,
      });
    }
  },
  ["pantrygrid", "food-banks", FOOD_BANK_CACHE_SCHEMA],
  { revalidate: FOOD_BANK_TTL_SECONDS },
);

function foodBanks(latitude: number, longitude: number, radiusMiles: number, cacheKey: string) {
  const existing = inFlightFoodBanks.get(cacheKey);
  if (existing) {
    logDevelopment("Food-bank request joined in-flight lookup", { key: cacheKey });
    return existing;
  }

  const request = getCachedFoodBanks(latitude, longitude, radiusMiles).finally(() => {
    inFlightFoodBanks.delete(cacheKey);
  });
  if (inFlightFoodBanks.size < MAX_IN_FLIGHT) inFlightFoodBanks.set(cacheKey, request);
  return request;
}

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  const radiusMiles = Number(request.nextUrl.searchParams.get("radius"));

  if (!Number.isFinite(latitude) || latitude < 24 || latitude > 72 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > -66) {
    return NextResponse.json({ error: "Valid U.S. latitude and longitude are required." }, { status: 400 });
  }
  if (!ALLOWED_RADII.has(radiusMiles)) {
    return NextResponse.json({ error: "Radius must be 25, 50, or 75 miles." }, { status: 400 });
  }

  const roundedLatitude = Number(latitude.toFixed(4));
  const roundedLongitude = Number(longitude.toFixed(4));
  const cacheKey = [
    "food-banks",
    FOOD_BANK_CACHE_SCHEMA,
    roundedLatitude,
    roundedLongitude,
    radiusMiles,
  ].join(":");
  const startedAt = Date.now();
  logDevelopment("Food banks requested", { key: cacheKey });

  try {
    const result = await foodBanks(roundedLatitude, roundedLongitude, radiusMiles, cacheKey);
    logDevelopment("Food banks completed", {
      key: cacheKey,
      durationMs: Date.now() - startedAt,
      cache: Date.now() - result.cachedAt > 100 ? "hit" : "miss-or-fresh",
    });
    return NextResponse.json({ foodBanks: result.foodBanks });
  } catch (error) {
    console.error("Food bank lookup failed", error);
    return NextResponse.json({ error: "The food-bank data services are busy right now. Please try again in a moment." }, { status: 503 });
  }
}
