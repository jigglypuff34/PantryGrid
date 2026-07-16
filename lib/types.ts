export type FoodBankSize = "Large" | "Medium" | "Small" | "Unknown";

export type FoodBank = {
  id: string;
  ein: string;
  name: string;
  dbaName?: string;
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
  size: FoodBankSize;
  sizeBasis: string;
  revenueAmount: number;
  assetAmount: number;
  incomeAmount: number;
  active: string;
  taxPeriod?: string;
  sourceUrl: string;
  phone?: string;
  website?: string;
  openingHours?: string;
};

export type FoodItem = {
  id: number;
  name: string;
  category: string;
  storageType: string;
  dietaryNotes?: string;
};

export type InventoryItem = FoodItem & { quantity: number };

export type FoodBankInventory = {
  bankId: string;
  size: FoodBankSize;
  itemCount: number;
  totalUnits: number;
  items: InventoryItem[];
};

export type SearchLocation = {
  latitude: number;
  longitude: number;
  displayName: string;
};
