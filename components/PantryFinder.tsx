"use client";

import dynamic from "next/dynamic";
import { FormEvent, useMemo, useState } from "react";
import type { FoodBank, FoodBankInventory, SearchLocation } from "@/lib/types";
import { distanceInMiles } from "@/lib/distance";
import FoodBankResults, { type FoodBankResult } from "./FoodBankResults";

const PantryMap = dynamic(() => import("./PantryMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map…</div>,
});

type FoodBankSearchResponse = {
  foodBanks: FoodBank[];
  total: number;
  truncated: boolean;
  error?: string;
};

export default function PantryFinder() {
  const [query, setQuery] = useState("");
  const [radius, setRadius] = useState(75);
  const [foodBanks, setFoodBanks] = useState<FoodBank[]>([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [resultsTruncated, setResultsTruncated] = useState(false);
  const [location, setLocation] = useState<SearchLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inventories, setInventories] = useState<Record<string, FoodBankInventory>>({});
  const [inventoryLoadingIds, setInventoryLoadingIds] = useState<string[]>([]);
  const [inventoryErrors, setInventoryErrors] = useState<Record<string, string>>({});

  const sortedFoodBanks = useMemo<FoodBankResult[]>(() => {
    if (!location) return [];
    return foodBanks
      .map((bank) => ({ ...bank, distanceMiles: distanceInMiles(location, bank) }))
      .sort((first, second) => first.distanceMiles - second.distanceMiles);
  }, [foodBanks, location]);

  async function selectBank(id: string) {
    setSelectedId(id);
    if (inventories[id] || inventoryLoadingIds.includes(id)) return;

    setInventoryLoadingIds((current) => [...current, id]);
    setInventoryErrors((current) => ({ ...current, [id]: "" }));
    try {
      const response = await fetch(`/api/food-banks/${encodeURIComponent(id)}/inventory`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Inventory lookup failed.");
      setInventories((current) => ({ ...current, [id]: data }));
    } catch (inventoryError) {
      setInventoryErrors((current) => ({
        ...current,
        [id]: inventoryError instanceof Error ? inventoryError.message : "Inventory lookup failed.",
      }));
    } finally {
      setInventoryLoadingIds((current) => current.filter((candidate) => candidate !== id));
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setError("Enter a city, ZIP code, or address to search.");
      return;
    }

    setLoading(true);
    setError("");
    setHasSearched(false);
    setSelectedId(null);
    setInventories({});
    setInventoryErrors({});

    try {
      const geocodeResponse = await fetch(`/api/geocode?q=${encodeURIComponent(trimmedQuery)}`);
      const geocodeData = await geocodeResponse.json();
      if (!geocodeResponse.ok) throw new Error(geocodeData.error || "Location lookup failed.");

      const nextLocation: SearchLocation = geocodeData;
      setLocation(nextLocation);
      const params = new URLSearchParams({
        lat: String(nextLocation.latitude),
        lon: String(nextLocation.longitude),
        radius: String(radius),
      });
      const foodBankResponse = await fetch(`/api/food-banks?${params}`);
      const foodBankData: FoodBankSearchResponse = await foodBankResponse.json();
      if (!foodBankResponse.ok) throw new Error(foodBankData.error || "Food-bank lookup failed.");

      setFoodBanks(foodBankData.foodBanks);
      setResultTotal(foodBankData.total);
      setResultsTruncated(foodBankData.truncated);
      setHasSearched(true);
    } catch (searchError) {
      setFoodBanks([]);
      setResultTotal(0);
      setResultsTruncated(false);
      setError(searchError instanceof Error ? searchError.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const resultSummary = resultsTruncated
    ? `Showing the closest ${foodBanks.length} of ${resultTotal} food banks`
    : `${resultTotal} food ${resultTotal === 1 ? "bank" : "banks"} found`;

  return (
    <main>
      <header className="hero">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
          <h1>PantryGrid</h1>
        </div>
        <p>Explore U.S. food banks, organizational size, and simulated inventory from the PantryGrid database.</p>

        <form className="search-panel" onSubmit={search}>
          <label className="location-field">
            <span>Location</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="City, ZIP code, or street address"
              maxLength={200}
              aria-describedby="search-status"
            />
          </label>
          <fieldset className="radius-field">
            <legend>Search radius</legend>
            <div className="radius-options">
              {[25, 50, 75].map((miles) => (
                <label key={miles} className={radius === miles ? "selected" : ""}>
                  <input
                    type="radio"
                    name="radius"
                    value={miles}
                    checked={radius === miles}
                    onChange={() => setRadius(miles)}
                  />
                  {miles} mi
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" disabled={loading}>
            {loading ? <span className="spinner" aria-hidden="true" /> : <span aria-hidden="true">⌕</span>}
            {loading ? "Searching…" : "Search"}
          </button>
        </form>
      </header>

      <section className="map-section" aria-label="Food bank search results">
        <div className="results-bar">
          <div>
            <strong>{loading ? "Searching the database…" : hasSearched ? resultSummary : "Explore nearby resources"}</strong>
            <span>{location && hasSearched ? `Within ${radius} miles of ${location.displayName.split(",").slice(0, 2).join(",")}` : "Search any U.S. location to begin"}</span>
          </div>
          <span className="data-label">IRS/NCCS database</span>
        </div>

        <span id="search-status" className="sr-only" aria-live="polite">
          {loading ? "Loading food banks" : error || (hasSearched ? resultSummary : "")}
        </span>

        <div className="map-results-layout">
          <PantryMap
            foodBanks={sortedFoodBanks}
            location={location}
            radiusMiles={radius}
            selectedId={selectedId}
            onSelect={selectBank}
          />
          <FoodBankResults
            foodBanks={sortedFoodBanks}
            total={resultTotal}
            selectedId={selectedId}
            onSelect={selectBank}
            inventories={inventories}
            inventoryLoadingIds={inventoryLoadingIds}
            inventoryErrors={inventoryErrors}
            loading={loading}
            error={error}
            hasSearched={hasSearched}
          />
        </div>
      </section>

      <footer>Organization details come from IRS/NCCS data. Inventory is simulated from the 2,500-item catalog and is not real-time availability.</footer>
    </main>
  );
}
