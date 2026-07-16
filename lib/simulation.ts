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

export function buildNearestTruckRoute(
  foodBanks: FoodBank[],
  target: RouteTarget | null,
  minimumSupplyPercent = 85,
): TruckRoute | null {
  if (!target || foodBanks.length === 0) return null;

  const candidates = foodBanks.filter((bank) => bank.id !== target.id && (bank.supplyPercent ?? 0) >= minimumSupplyPercent);
  if (candidates.length === 0) return null;

  const nearestBank = candidates.reduce<FoodBank | null>((closest, bank) => {
    if (!closest) return bank;
    return distanceInMiles(target, bank) < distanceInMiles(target, closest) ? bank : closest;
  }, null);

  if (!nearestBank) return null;

  const origin = createRoutePoint(nearestBank);
  const destination = createRoutePoint(target);

  return {
    id: `truck-route:${origin.id ?? `${origin.latitude},${origin.longitude}`}->${destination.id}`,
    origin,
    destination,
    distanceMiles: distanceInMiles(origin, destination),
    path: [origin, destination],
  };
}

async function fetchRoadPath(origin: RoutePoint, destination: RoutePoint): Promise<RoutePoint[]> {
  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const params = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    steps: "false",
  });

  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OSRM returned ${response.status}`);

  const data = (await response.json()) as {
    routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> }; distance?: number }>;
  };

  const coordinatesList = data.routes?.[0]?.geometry?.coordinates;
  if (!coordinatesList || coordinatesList.length === 0) {
    return [origin, destination];
  }

  return coordinatesList.map(([longitude, latitude]) => ({
    latitude,
    longitude,
  }));
}

export async function buildNearestTruckRouteWithRoads(
  foodBanks: FoodBank[],
  target: RouteTarget | null,
  minimumSupplyPercent = 85,
): Promise<TruckRoute | null> {
  const route = buildNearestTruckRoute(foodBanks, target, minimumSupplyPercent);
  if (!route) return null;

  try {
    const roadPath = await fetchRoadPath(route.origin, route.destination);
    return {
      ...route,
      path: roadPath,
      distanceMiles: route.distanceMiles,
    };
  } catch {
    return route;
  }
}