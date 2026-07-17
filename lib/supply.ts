import type { FoodBank } from "./types";

type SupplyInput = Pick<FoodBank, "id" | "name" | "supplyPoundsThousands">;

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function estimateBankSizeThousands(bank: SupplyInput): number {
  if (typeof bank.supplyPoundsThousands === "number" && Number.isFinite(bank.supplyPoundsThousands)) {
    return bank.supplyPoundsThousands;
  }

  const seed = hashString(`${bank.id}:${bank.name}`);
  const minimum = 18;
  const spread = 122;
  return minimum + (seed % spread);
}

export function calculateSupplyPercent(bankSizeThousands: number, surroundingPopulation: number | null): number {
  const populationThousands = Math.max((surroundingPopulation ?? 100_000) / 1_000, 1);
  return Math.max(0, Math.min(100, Math.round((bankSizeThousands / populationThousands) * 100)));
}

export function deriveSupplyLevel(supplyPercent: number): string {
  if (supplyPercent >= 80) return "full";
  if (supplyPercent >= 55) return "moderate";
  if (supplyPercent > 0) return "low";
  return "empty";
}