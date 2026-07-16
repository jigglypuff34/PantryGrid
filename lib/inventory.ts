import type { FoodBankInventory, FoodBankSize, FoodItem } from "./types";

const INVENTORY_PROFILES: Record<FoodBankSize, {
  minimumItems: number;
  maximumItems: number;
  minimumQuantity: number;
  maximumQuantity: number;
}> = {
  Large: { minimumItems: 38, maximumItems: 56, minimumQuantity: 12, maximumQuantity: 50 },
  Medium: { minimumItems: 26, maximumItems: 38, minimumQuantity: 8, maximumQuantity: 36 },
  Small: { minimumItems: 14, maximumItems: 24, minimumQuantity: 4, maximumQuantity: 24 },
  Unknown: { minimumItems: 8, maximumItems: 16, minimumQuantity: 2, maximumQuantity: 18 },
};

function seedFromText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: number) {
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInteger(random: () => number, minimum: number, maximum: number) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

export function generateInventory(
  bankId: string,
  size: FoodBankSize,
  catalog: FoodItem[],
): FoodBankInventory {
  const profile = INVENTORY_PROFILES[size];
  const random = createRandom(seedFromText(`${bankId}:pantrygrid-inventory-v1`));
  const itemCount = Math.min(
    catalog.length,
    randomInteger(random, profile.minimumItems, profile.maximumItems),
  );
  const available = [...catalog];
  const items = [];

  for (let index = 0; index < itemCount; index += 1) {
    const selectionIndex = index + Math.floor(random() * (available.length - index));
    [available[index], available[selectionIndex]] = [available[selectionIndex], available[index]];
    items.push({
      ...available[index],
      quantity: randomInteger(random, profile.minimumQuantity, profile.maximumQuantity),
    });
  }

  return {
    bankId,
    size,
    itemCount: items.length,
    totalUnits: items.reduce((total, item) => total + item.quantity, 0),
    items,
  };
}
