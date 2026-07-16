"use client";

import L from "leaflet";
import { Circle, MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from "react-leaflet";
import { useEffect, useRef } from "react";
import type { FoodBank, SearchLocation, TruckRoute } from "@/lib/types";

const searchIcon = L.divIcon({
  className: "custom-marker",
  html: '<div class="search-pin"><span></span></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -16],
});

function FitResults({ foodBanks, location, truckRoutes }: { foodBanks: FoodBank[]; location: SearchLocation | null; truckRoutes: TruckRoute[] }) {
  const map = useMap();

  useEffect(() => {
    if (!location && foodBanks.length === 0 && truckRoutes.length === 0) return;
    const points = [
      ...(location ? [L.latLng(location.latitude, location.longitude)] : []),
      ...foodBanks.map((bank) => L.latLng(bank.latitude, bank.longitude)),
      ...truckRoutes.flatMap((route) => route.path.map((point) => L.latLng(point.latitude, point.longitude))),
    ];
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 9);
    else map.fitBounds(L.latLngBounds(points), { padding: [44, 44], maxZoom: 12 });
  }, [foodBanks, location, map, truckRoutes]);

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

function getSupplyTone(bank: FoodBank): "full" | "empty" | "mid" | "unknown" {
  if (bank.supplyLevel === "empty" || bank.supplyPercent === 0) return "empty";
  if (bank.supplyLevel === "full" || (typeof bank.supplyPercent === "number" && bank.supplyPercent >= 80)) return "full";
  if (typeof bank.supplyPercent === "number" || bank.supplyLevel) return "mid";
  return "unknown";
}

function createSupplyIcon(bank: FoodBank) {
  const tone = getSupplyTone(bank);
  return L.divIcon({
    className: `custom-marker supply-marker supply-${tone}`,
    html: '<div class="supply-pin"><span>♥</span></div>',
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -38],
  });
}

function renderSupplyLabel(bank: FoodBank) {
  if (typeof bank.supplyPercent === "number" && bank.supplyLevel) return `${bank.supplyPercent}% ${bank.supplyLevel}`;
  if (typeof bank.supplyPercent === "number") return `${bank.supplyPercent}%`;
  return bank.supplyLevel ?? "unknown";
}

function renderEstimatedSize(bank: FoodBank) {
  if (typeof bank.supplyPoundsThousands !== "number") return null;
  return `${bank.supplyPoundsThousands.toFixed(0)} thousand pounds`;
}

export default function PantryMap({ foodBanks, location, radiusMiles, truckRoutes, selectedId, onSelect }: {
  foodBanks: FoodBank[];
  location: SearchLocation | null;
  radiusMiles: number;
  truckRoutes: TruckRoute[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const markerRefs = useRef(new Map<string, L.Marker>());

  return (
    <MapContainer center={[39.5, -98.35]} zoom={4} scrollWheelZoom className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitResults foodBanks={foodBanks} location={location} truckRoutes={truckRoutes} />
      <SelectedMarker foodBanks={foodBanks} selectedId={selectedId} markerRefs={markerRefs} />
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
      {truckRoutes.map((route) => (
        <Polyline
          key={route.id}
          positions={route.path.map((point) => [point.latitude, point.longitude] as [number, number])}
          pathOptions={{ color: "#d46c24", weight: 4, opacity: 0.9, dashArray: "8 10" }}
        />
      ))}
      {foodBanks.map((bank) => {
        const website = bank.website ? safeWebsiteUrl(bank.website) : null;
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${bank.latitude},${bank.longitude}`;
        const supplyIcon = createSupplyIcon(bank);
        return (
          <Marker
            key={bank.id}
            position={[bank.latitude, bank.longitude]}
            icon={supplyIcon}
            ref={(marker) => {
              if (marker) markerRefs.current.set(bank.id, marker);
              else markerRefs.current.delete(bank.id);
            }}
            eventHandlers={{ click: () => onSelect(bank.id) }}
          >
            <Popup>
              <div className="popup-content">
                <strong>{bank.name}</strong>
                {bank.address && <span>{bank.address}</span>}
                {(bank.supplyLevel || typeof bank.supplyPercent === "number") && (
                  <span className={`popup-supply supply-${getSupplyTone(bank)}`}>
                    <span className="supply-heart" aria-hidden="true">♥</span>
                    <b>Supply:</b> {renderSupplyLabel(bank)}
                  </span>
                )}
                {renderEstimatedSize(bank) && (
                  <span className="popup-estimate"><b>Estimated size:</b> {renderEstimatedSize(bank)}</span>
                )}
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

function SelectedMarker({ foodBanks, selectedId, markerRefs }: {
  foodBanks: FoodBank[];
  selectedId: string | null;
  markerRefs: React.RefObject<Map<string, L.Marker>>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedId) return;
    const bank = foodBanks.find((candidate) => candidate.id === selectedId);
    if (!bank) return;
    map.setView([bank.latitude, bank.longitude], Math.max(map.getZoom(), 13), { animate: true });
    markerRefs.current.get(selectedId)?.openPopup();
  }, [foodBanks, map, markerRefs, selectedId]);

  return null;
}
