export type FoodBank = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
  supplyPercent?: number;
  supplyLevel?: string;
};

export type SearchLocation = {
  latitude: number;
  longitude: number;
  displayName: string;
};

export type RoutePoint = {
  id?: string;
  name?: string;
  latitude: number;
  longitude: number;
  supplyLevel?: string;
};

export type TruckRoute = {
  id: string;
  origin: RoutePoint;
  destination: RoutePoint;
  distanceMiles: number;
  path: RoutePoint[];
};
