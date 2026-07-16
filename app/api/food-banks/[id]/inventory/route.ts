import { NextResponse } from "next/server";
import bankDatabase from "@/data/food-banks.json";
import foodCatalog from "@/data/food-items.json";
import { generateInventory } from "@/lib/inventory";
import type { FoodBank, FoodItem } from "@/lib/types";

const foodBanks = bankDatabase.records as FoodBank[];
const foodItems = foodCatalog.records as FoodItem[];

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const bank = foodBanks.find((candidate) => candidate.id === id);

  if (!bank) {
    return NextResponse.json({ error: "Food bank not found." }, { status: 404 });
  }

  const response = NextResponse.json(generateInventory(bank.id, bank.size, foodItems));
  response.headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  return response;
}
