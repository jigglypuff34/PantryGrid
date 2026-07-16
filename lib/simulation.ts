import { distanceInMiles } from "./distance";
import type { FoodBank, RoutePoint, TruckRoute } from "./types";

type RouteTarget = RoutePoint;

function createRoutePoint(point: RouteTarget): RoutePoint {
  return {
    id: point.id,
    name: point.name,
    latitude: point.latitude,
    longitude: point.longitude,
    supplyLevel: point.supplyLevel,
  };
}

export function buildNearestTruckRoute(foodBanks: FoodBank[], target: RouteTarget | null): TruckRoute | null {
  if (!target || foodBanks.length === 0) return null;

  const candidates = foodBanks.filter((bank) => bank.id !== target.id);
  const nearestBank = (candidates.length > 0 ? candidates : foodBanks).reduce<FoodBank | null>((closest, bank) => {
    if (!closest) return bank;
    return distanceInMiles(target, bank) < distanceInMiles(target, closest) ? bank : closest;
  }, null);

  if (!nearestBank) return null;

  const origin = createRoutePoint(target);
  const destination = createRoutePoint(nearestBank);

  return {
    id: `truck-route:${origin.id ?? `${origin.latitude},${origin.longitude}`}->${destination.id}`,
    origin,
    destination,
    distanceMiles: distanceInMiles(origin, destination),
    path: [origin, destination],
  };
}