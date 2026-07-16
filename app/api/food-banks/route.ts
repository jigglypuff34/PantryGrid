import { NextRequest, NextResponse } from "next/server";
import { normalizeFoodBanks } from "@/lib/osm";

const USER_AGENT = "PantryGrid-Hackathon-MVP/1.0 (+https://github.com/pantrygrid)";
const ALLOWED_RADII = new Set([25, 50, 75]);

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

  const radiusMeters = Math.round(radiusMiles * 1609.344);
  const query = `[out:json][timeout:30];\n(\n  nwr["social_facility"="food_bank"](around:${radiusMeters},${latitude},${longitude});\n);\nout center tags;`;

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
      },
      body: new URLSearchParams({ data: query }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Overpass returned ${response.status}`);

    const data = (await response.json()) as { elements?: Parameters<typeof normalizeFoodBanks>[0] };
    return NextResponse.json({ foodBanks: normalizeFoodBanks(data.elements ?? []) });
  } catch (error) {
    console.error("Food bank lookup failed", error);
    return NextResponse.json({ error: "The food-bank data service is temporarily unavailable. Please try again." }, { status: 502 });
  }
}
