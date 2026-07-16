import { NextRequest, NextResponse } from "next/server";

const USER_AGENT = "PantryGrid-Hackathon-MVP/1.0 (+https://github.com/pantrygrid)";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2 || query.length > 200) {
    return NextResponse.json({ error: "Enter a U.S. city, ZIP code, or address." }, { status: 400 });
  }

  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
    countrycodes: "us",
  });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);

    const results = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!results.length) {
      return NextResponse.json({ error: "We couldn't find that location in the United States." }, { status: 404 });
    }

    const latitude = Number(results[0].lat);
    const longitude = Number(results[0].lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Invalid coordinates");

    return NextResponse.json({ latitude, longitude, displayName: results[0].display_name });
  } catch (error) {
    console.error("Geocoding failed", error);
    return NextResponse.json({ error: "The location service is temporarily unavailable. Please try again." }, { status: 502 });
  }
}
