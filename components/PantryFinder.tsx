"use client";

import dynamic from "next/dynamic";
import { FormEvent, useState } from "react";
import type { FoodBank, SearchLocation } from "@/lib/types";

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
        <p>Find nearby food banks and food pantries using community-powered map data.</p>

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
            <span>{location && hasSearched ? `Within ${radius} miles of ${location.displayName.split(",").slice(0, 2).join(",")}` : "Search any U.S. location to begin"}</span>
          </div>
          <span className="data-label">OpenStreetMap data</span>
        </div>

        <div id="search-status" className="status" aria-live="polite">
          {error && <div className="error"><strong>We couldn’t complete that search.</strong> {error}</div>}
          {!error && hasSearched && foodBanks.length === 0 && (
            <div className="no-results"><strong>No food banks found in this area.</strong> Try a larger radius or nearby city.</div>
          )}
        </div>

        <PantryMap foodBanks={foodBanks} location={location} radiusMiles={radius} />
      </section>

      <footer>PantryGrid is a prototype. Always confirm hours and services directly with the organization.</footer>
    </main>
  );
}
