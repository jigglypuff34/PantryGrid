import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import type { SearchLocation } from "@/lib/types";

const USER_AGENT = "PantryGrid-Hackathon-MVP/1.0 (+https://github.com/pantrygrid)";
const GEOCODE_TTL_SECONDS = 30 * 24 * 60 * 60;
const NOMINATIM_TIMEOUT_MS = 10_000;
const MAX_IN_FLIGHT = 100;

type CachedGeocode = { location: SearchLocation | null; cachedAt: number };

const inFlightGeocodes = new Map<string, Promise<CachedGeocode>>();

function logDevelopment(message: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "development") console.info(`[PantryGrid] ${message}`, details);
}

function normalizeLocationQuery(query: string) {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

const getCachedGeocode = unstable_cache(
  async (normalizedQuery: string): Promise<CachedGeocode> => {
    const startedAt = Date.now();
    const params = new URLSearchParams({
      q: normalizedQuery,
      format: "jsonv2",
      limit: "1",
      countrycodes: "us",
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);

      const results: unknown = await response.json();
      if (!Array.isArray(results)) throw new Error("Nominatim returned malformed data");
      if (results.length === 0) return { location: null, cachedAt: Date.now() };

      const result = results[0] as Record<string, unknown>;
      const latitude = Number(result.lat);
      const longitude = Number(result.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || typeof result.display_name !== "string") {
        throw new Error("Nominatim returned invalid coordinates");
      }

      return {
        location: { latitude, longitude, displayName: result.display_name },
        cachedAt: Date.now(),
      };
    } finally {
      clearTimeout(timeout);
      logDevelopment("Nominatim requested", { key: normalizedQuery, durationMs: Date.now() - startedAt });
    }
  },
  ["pantrygrid", "geocode", "v1"],
  { revalidate: GEOCODE_TTL_SECONDS },
);

function geocode(normalizedQuery: string) {
  const existing = inFlightGeocodes.get(normalizedQuery);
  if (existing) {
    logDevelopment("Geocoding request joined in-flight lookup", { key: normalizedQuery });
    return existing;
  }

  const request = getCachedGeocode(normalizedQuery).finally(() => {
    inFlightGeocodes.delete(normalizedQuery);
  });
  if (inFlightGeocodes.size < MAX_IN_FLIGHT) inFlightGeocodes.set(normalizedQuery, request);
  return request;
}

export async function GET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get("q") ?? "";
  const normalizedQuery = normalizeLocationQuery(rawQuery);
  if (normalizedQuery.length < 2 || normalizedQuery.length > 200) {
    return NextResponse.json({ error: "Enter a U.S. city, ZIP code, or address." }, { status: 400 });
  }

  const startedAt = Date.now();
  logDevelopment("Geocoding requested", { key: normalizedQuery });

  try {
    const result = await geocode(normalizedQuery);
    logDevelopment("Geocoding completed", {
      key: normalizedQuery,
      durationMs: Date.now() - startedAt,
      cache: Date.now() - result.cachedAt > 100 ? "hit" : "miss-or-fresh",
    });
    if (!result.location) {
      return NextResponse.json({ error: "We couldn't find that location in the United States." }, { status: 404 });
    }
    return NextResponse.json(result.location);
  } catch (error) {
    console.error("Geocoding failed", error);
    return NextResponse.json({ error: "The location service is temporarily unavailable. Please try again." }, { status: 502 });
  }
}
