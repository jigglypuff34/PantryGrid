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

function normalizeSupplyPercent(rawValue?: string): number | undefined {
  if (!rawValue) return undefined;

  const numericValue = Number(rawValue.replace(/[^\d.]/g, ""));
  if (Number.isFinite(numericValue)) {
    return Math.max(0, Math.min(100, Math.round(numericValue)));
  }

  const normalized = rawValue.trim().toLowerCase();
  if (["full", "well stocked", "high"].includes(normalized)) return 100;
  if (["moderate", "medium", "partial"].includes(normalized)) return 50;
  if (["low", "limited"].includes(normalized)) return 25;
  if (["empty", "none", "out"].includes(normalized)) return 0;

  return undefined;
}

function deriveSupplyLevel(supplyPercent?: number, fallback?: string): string | undefined {
  if (fallback) return fallback;
  if (typeof supplyPercent !== "number") return undefined;
  if (supplyPercent >= 80) return "full";
  if (supplyPercent >= 55) return "moderate";
  if (supplyPercent > 0) return "low";
  return "empty";
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
    const supplyPercent = normalizeSupplyPercent(
      tags.supply_percent || tags["supply:percent"] || tags["food_bank:supply_percent"] || tags["supply"]
    );
    const supplyLevel = deriveSupplyLevel(
      supplyPercent,
      tags.supply_level || tags["supply:level"] || tags["food_bank:supply_level"]
    );
    foodBanks.push({
      id,
      name: tags.name || "Unnamed Food Bank",
      latitude: latitude as number,
      longitude: longitude as number,
      address: buildAddress(tags),
      phone: tags.phone || tags["contact:phone"],
      website: tags.website || tags["contact:website"],
      openingHours: tags.opening_hours,
      supplyPercent,
      supplyLevel,
    });
  }

  return foodBanks;
}
