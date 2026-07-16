import { NextRequest, NextResponse } from "next/server";
import database from "@/data/food-banks.json";
import { distanceInMiles } from "@/lib/distance";
import type { FoodBank } from "@/lib/types";

const ALLOWED_RADII = new Set([25, 50, 75]);
const MAX_RESULTS = 200;
const foodBanks = database.records as FoodBank[];

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  const radiusMiles = Number(request.nextUrl.searchParams.get("radius"));

  if (!Number.isFinite(latitude) || latitude < 24 || latitude > 72 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > -66) {
    return NextResponse.json(
      { error: "Valid U.S. latitude and longitude are required." },
      { status: 400 },
    );
  }
  if (!ALLOWED_RADII.has(radiusMiles)) {
    return NextResponse.json(
      { error: "Radius must be 25, 50, or 75 miles." },
      { status: 400 },
    );
  }

  const nearby = foodBanks
    .map((bank) => ({ bank, distance: distanceInMiles({ latitude, longitude }, bank) }))
    .filter(({ distance }) => distance <= radiusMiles)
    .sort((first, second) => first.distance - second.distance);

  return NextResponse.json({
    foodBanks: nearby.slice(0, MAX_RESULTS).map(({ bank }) => bank),
    total: nearby.length,
    truncated: nearby.length > MAX_RESULTS,
    database: {
      generatedOn: database.generatedOn,
      recordCount: database.recordCount,
      source: "IRS/NCCS NTEE K31",
    },
  });
}
