"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { FoodBank, SearchLocation, TruckRoute } from "@/lib/types";
import { distanceInMiles } from "@/lib/distance";
import { buildNearestTruckRouteWithRoads } from "@/lib/simulation";
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
  const [locating, setLocating] = useState(true);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [truckRoutes, setTruckRoutes] = useState<TruckRoute[]>([]);
  const [locationInitialized, setLocationInitialized] = useState(false);
  const [routing, setRouting] = useState(false);

  async function resolveCurrentLocation(): Promise<SearchLocation> {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 12_000,
            maximumAge: 60_000,
          });
        });

        return {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          displayName: "Your current location",
        };
      } catch {
        // Fall through to IP-based approximation below.
      }
    }

    try {
      const response = await fetch("https://ipapi.co/json/", { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as {
          latitude?: number;
          longitude?: number;
          city?: string;
          region?: string;
          country_name?: string;
        };

        if (typeof data.latitude === "number" && typeof data.longitude === "number") {
          return {
            latitude: data.latitude,
            longitude: data.longitude,
            displayName: [data.city, data.region, data.country_name].filter(Boolean).join(", ") || "Your current area",
          };
        }
      }
    } catch {
      // Ignore and fall back to a broad center below.
    }

    return {
      latitude: 39.5,
      longitude: -98.35,
      displayName: "United States",
    };
  }

  const sortedFoodBanks = useMemo<FoodBankResult[]>(() => {
    if (!location) return [];
    return foodBanks
      .map((bank) => ({ ...bank, distanceMiles: distanceInMiles(location, bank) }))
      .sort((first, second) => first.distanceMiles - second.distanceMiles);
  }, [foodBanks, location]);

  const truckRouteTarget = useMemo(() => {
    if (!location) return null;
    return {
      id: `location:${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`,
      name: location.displayName.split(",")[0] || "Selected location",
      latitude: location.latitude,
      longitude: location.longitude,
    };
  }, [location]);

  const hasEligibleTruckBank = useMemo(
    () => foodBanks.some((bank) => (bank.supplyPercent ?? 0) >= 85),
    [foodBanks],
  );

  async function generateTruckRoute(target: SearchLocation) {
    if (!location || !target) return;
    setRouting(true);
    try {
      const route = await buildNearestTruckRouteWithRoads(foodBanks, target, 85);
      setTruckRoutes(route ? [route] : []);
    } catch (routeError) {
      setError(routeError instanceof Error ? routeError.message : "Truck routing failed. Please try again.");
    } finally {
      setRouting(false);
    }
  }

  async function requestRefillForBank(bank: FoodBankResult) {
    await generateTruckRoute({
      id: bank.id,
      latitude: bank.latitude,
      longitude: bank.longitude,
      displayName: bank.name,
    });
  }

  async function loadFoodBanksForLocation(nextLocation: SearchLocation, nextRadius: number) {
    setLocation(nextLocation);
    setLoading(true);
    setError("");
    setHasSearched(false);
    setSelectedId(null);
    setTruckRoutes([]);

    try {
      const params = new URLSearchParams({
        lat: String(nextLocation.latitude),
        lon: String(nextLocation.longitude),
        radius: String(nextRadius),
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

  useEffect(() => {
    if (locationInitialized) return;

    void (async () => {
      const currentLocation = await resolveCurrentLocation();
      setLocating(false);
      setLocationInitialized(true);
      await loadFoodBanksForLocation(currentLocation, radius);
    })();
  }, []);

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

      await loadFoodBanksForLocation(geocodeData, radius);
    } catch (searchError) {
      setFoodBanks([]);
      setError(searchError instanceof Error ? searchError.message : "Something went wrong. Please try again.");
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
        <p>{locating ? "Finding your current location…" : "Nearby food banks load from your current location first. Search below if you want a different place."}</p>
      </header>

      <section className="map-section" aria-label="Food bank search results">
        <div className="results-bar">
          <div>
            <strong>{locating ? "Locating you…" : loading ? "Searching nearby…" : hasSearched ? `${foodBanks.length} food ${foodBanks.length === 1 ? "bank" : "banks"} found` : "Explore nearby resources"}</strong>
            <span>{location && hasSearched ? `Centered on ${location.displayName.split(",").slice(0, 2).join(",")}${truckRoutes.length ? ` · ${truckRoutes.length} truck ${truckRoutes.length === 1 ? "route" : "routes"} active` : ""}` : "Your map starts at your current location"}</span>
          </div>
          <div className="bar-actions">
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
            onGenerateTruckRoute={() => {
              if (!truckRouteTarget) return;
              void generateTruckRoute(truckRouteTarget);
            }}
            canGenerateTruckRoute={Boolean(location && hasSearched && !loading && !locating && hasEligibleTruckBank)}
          />
          <FoodBankResults
            foodBanks={sortedFoodBanks}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRequestRefill={requestRefillForBank}
            canRequestRefill={Boolean(!routing && hasEligibleTruckBank)}
            loading={loading}
            error={error}
            hasSearched={hasSearched}
          />
        </div>
      </section>

      <section className="search-footer" aria-label="Optional search controls">
        <p>Optional search</p>
        <form className="search-panel search-panel-bottom" onSubmit={search}>
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
                  {miles}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" disabled={loading || locating}>
            {loading ? <span className="spinner" aria-hidden="true" /> : <span aria-hidden="true">⌕</span>}
            {loading ? "Searching…" : "Search a different place"}
          </button>
        </form>
      </section>

      <footer>PantryGrid is a prototype. Always confirm hours and services directly with the organization.</footer>
    </main>
  );
}
