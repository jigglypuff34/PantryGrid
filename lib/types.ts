export type FoodBank = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
};

export type SearchLocation = {
  latitude: number;
  longitude: number;
  displayName: string;
};
