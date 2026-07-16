"use client";

import L from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { FoodBank, SearchLocation } from "@/lib/types";

const pantryIcon = L.divIcon({
  className: "custom-marker",
  html: '<div class="pantry-pin"><span>+</span></div>',
  iconSize: [34, 42],
  iconAnchor: [17, 42],
  popupAnchor: [0, -38],
});

const searchIcon = L.divIcon({
  className: "custom-marker",
  html: '<div class="search-pin"><span></span></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -16],
});

function FitResults({ foodBanks, location }: { foodBanks: FoodBank[]; location: SearchLocation | null }) {
  const map = useMap();

  useEffect(() => {
    if (!location) return;
    const points = [
      L.latLng(location.latitude, location.longitude),
      ...foodBanks.map((bank) => L.latLng(bank.latitude, bank.longitude)),
    ];
    if (points.length === 1) map.setView(points[0], 9);
    else map.fitBounds(L.latLngBounds(points), { padding: [44, 44], maxZoom: 12 });
  }, [foodBanks, location, map]);

  return null;
}

function safeWebsiteUrl(website: string): string | null {
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function PantryMap({ foodBanks, location, radiusMiles }: {
  foodBanks: FoodBank[];
  location: SearchLocation | null;
  radiusMiles: number;
}) {
  return (
    <MapContainer center={[39.5, -98.35]} zoom={4} scrollWheelZoom className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitResults foodBanks={foodBanks} location={location} />
      {location && (
        <>
          <Circle
            center={[location.latitude, location.longitude]}
            radius={radiusMiles * 1609.344}
            pathOptions={{ color: "#297c70", weight: 2, fillColor: "#55a99b", fillOpacity: 0.08 }}
          />
          <Marker position={[location.latitude, location.longitude]} icon={searchIcon}>
            <Popup><strong>Searched location</strong><br />{location.displayName}</Popup>
          </Marker>
        </>
      )}
      {foodBanks.map((bank) => {
        const website = bank.website ? safeWebsiteUrl(bank.website) : null;
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${bank.latitude},${bank.longitude}`;
        return (
          <Marker key={bank.id} position={[bank.latitude, bank.longitude]} icon={pantryIcon}>
            <Popup>
              <div className="popup-content">
                <strong>{bank.name}</strong>
                {bank.address && <span>{bank.address}</span>}
                {bank.phone && <a href={`tel:${bank.phone}`}>{bank.phone}</a>}
                {bank.openingHours && <span><b>Hours:</b> {bank.openingHours}</span>}
                <div className="popup-links">
                  {website && <a href={website} target="_blank" rel="noreferrer">Website</a>}
                  <a href={mapsUrl} target="_blank" rel="noreferrer">Open in Maps</a>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
