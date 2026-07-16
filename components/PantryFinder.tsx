"use client";

import dynamic from "next/dynamic";
import { FormEvent, useMemo, useState } from "react";
import type { FoodBank, SearchLocation, TruckRoute } from "@/lib/types";
import { distanceInMiles } from "@/lib/distance";
import { buildNearestTruckRoute } from "@/lib/simulation";
import FoodBankResults, { type FoodBankResult } from "./FoodBankResults";

const PantryMap = dynamic(() => import("./PantryMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map…</div>,
});

export default function PantryFinder() {
  const [query, setQuery] = useState("");
  const [radius, setRadius] = useState(75);
  const [foodBanks, setFoodBanks] = useState<FoodBank[]>([]);
  const [location, setLocation] = useState<SearchLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [truckRoutes, setTruckRoutes] = useState<TruckRoute[]>([]);

  const sortedFoodBanks = useMemo<FoodBankResult[]>(() => {
    if (!location) return [];
    return foodBanks
      .map((bank) => ({ ...bank, distanceMiles: distanceInMiles(location, bank) }))
      .sort((first, second) => first.distanceMiles - second.distanceMiles);
  }, [foodBanks, location]);

  const selectedFoodBank = useMemo(() => {
    if (!selectedId) return null;
    return foodBanks.find((bank) => bank.id === selectedId) ?? null;
  }, [foodBanks, selectedId]);

  const truckRouteTarget = useMemo(() => {
    if (selectedFoodBank) return selectedFoodBank;
    if (location) {
      return {
        id: `location:${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`,
        name: location.displayName.split(",")[0] || "Selected location",
        latitude: location.latitude,
        longitude: location.longitude,
      };
    }
    return null;
  }, [location, selectedFoodBank]);

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
    setTruckRoutes([]);

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
      const foodBankData = await foodBankResponse.json();
      if (!foodBankResponse.ok) throw new Error(foodBankData.error || "Food-bank lookup failed.");

      setFoodBanks(foodBankData.foodBanks);
      setHasSearched(true);
    } catch (searchError) {
      setFoodBanks([]);
      setError(searchError instanceof Error ? searchError.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <header className="hero">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
          <h1>PantryGrid</h1>
        </div>
        <p>Find nearby food banks and food pantries using community map data.</p>

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
            <strong>{loading ? "Searching nearby…" : hasSearched ? `${foodBanks.length} food ${foodBanks.length === 1 ? "bank" : "banks"} found` : "Explore nearby resources"}</strong>
            <span>{location && hasSearched ? `Within ${radius} miles of ${location.displayName.split(",").slice(0, 2).join(",")}${truckRoutes.length ? ` · ${truckRoutes.length} truck ${truckRoutes.length === 1 ? "route" : "routes"} active` : ""}` : "Search any U.S. location to begin"}</span>
          </div>
          <div className="bar-actions">
            <button
              type="button"
              className="simulate-button"
              disabled={loading || !hasSearched || foodBanks.length < 2 || !truckRouteTarget}
              onClick={() => {
                if (!truckRouteTarget) return;
                const route = buildNearestTruckRoute(foodBanks, truckRouteTarget);
                setTruckRoutes(route ? [route] : []);
              }}
            >
              Simulate truck route
            </button>
            <span className="data-label">OpenStreetMap data</span>
          </div>
        </div>

        <span id="search-status" className="sr-only" aria-live="polite">
          {loading ? "Loading food banks" : error || (hasSearched ? `${foodBanks.length} food banks found` : "")}
        </span>

        <div className="map-results-layout">
          <PantryMap
            foodBanks={sortedFoodBanks}
            location={location}
            radiusMiles={radius}
            truckRoutes={truckRoutes}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <FoodBankResults
            foodBanks={sortedFoodBanks}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={loading}
            error={error}
            hasSearched={hasSearched}
          />
        </div>
      </section>

      <footer>PantryGrid is a prototype. Always confirm hours and services directly with the organization.</footer>
    </main>
  );
}
