import type { FoodBank } from "./types";

type OsmTags = Record<string, string>;

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: OsmTags;
};

function buildAddress(tags: OsmTags): string | undefined {
  if (tags["addr:full"]) return tags["addr:full"];
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const locality = [tags["addr:city"], tags["addr:state"], tags["addr:postcode"]]
    .filter(Boolean)
    .join(", ");
  return [street, locality].filter(Boolean).join(", ") || undefined;
}

export function normalizeFoodBanks(elements: OverpassElement[]): FoodBank[] {
  const seen = new Set<string>();
  const foodBanks: FoodBank[] = [];

  for (const element of elements) {
    const id = `${element.type}/${element.id}`;
    if (seen.has(id)) continue;

    const latitude = element.type === "node" ? element.lat : element.center?.lat;
    const longitude = element.type === "node" ? element.lon : element.center?.lon;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    seen.add(id);
    const tags = element.tags ?? {};
    foodBanks.push({
      id,
      name: tags.name || "Unnamed Food Bank",
      latitude: latitude as number,
      longitude: longitude as number,
      address: buildAddress(tags),
      phone: tags.phone || tags["contact:phone"],
      website: tags.website || tags["contact:website"],
      openingHours: tags.opening_hours,
      supplyLevel: tags.supply_level || tags["supply:level"] || tags.supply || tags["food_bank:supply_level"],
    });
  }

  return foodBanks;
}
