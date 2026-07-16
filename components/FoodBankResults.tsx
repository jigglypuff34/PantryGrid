"use client";

import { KeyboardEvent, useEffect, useRef } from "react";
import type { FoodBank } from "@/lib/types";

export type FoodBankResult = FoodBank & { distanceMiles: number };

function safeWebsiteUrl(website: string): string | null {
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function FoodBankResults({
  foodBanks,
  selectedId,
  onSelect,
  loading,
  error,
  hasSearched,
}: {
  foodBanks: FoodBankResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string;
  hasSearched: boolean;
}) {
  const cardRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!selectedId) return;
    cardRefs.current.get(selectedId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>, id: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  }

  return (
    <aside className="results-panel" aria-label="Food bank results">
      <div className="results-panel-heading">
        <div>
          <span>Nearby resources</span>
          <h2>Food banks</h2>
        </div>
        {hasSearched && !loading && !error && (
          <strong>{foodBanks.length} found</strong>
        )}
      </div>

      <div className="results-list" aria-live="polite" aria-busy={loading}>
        {loading && <div className="panel-state"><span className="spinner panel-spinner" />Loading food banks…</div>}
        {!loading && error && <div className="panel-state panel-error"><strong>Search failed</strong><span>{error}</span></div>}
        {!loading && !error && hasSearched && foodBanks.length === 0 && (
          <div className="panel-state"><strong>No food banks found</strong><span>Try a larger radius or a nearby city.</span></div>
        )}
        {!loading && !error && !hasSearched && (
          <div className="panel-state"><strong>Search to see results</strong><span>Food banks will appear here, nearest first.</span></div>
        )}
        {!loading && !error && foodBanks.map((bank) => {
          const website = bank.website ? safeWebsiteUrl(bank.website) : null;
          const selected = selectedId === bank.id;
          return (
            <article
              key={bank.id}
              ref={(element) => {
                if (element) cardRefs.current.set(bank.id, element);
                else cardRefs.current.delete(bank.id);
              }}
              className={`result-card${selected ? " selected" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              onClick={() => onSelect(bank.id)}
              onKeyDown={(event) => handleKeyDown(event, bank.id)}
            >
              <div className="result-card-title">
                <h3>{bank.name}</h3>
                <span>{bank.distanceMiles.toFixed(1)} mi</span>
              </div>
              <dl>
                {bank.address && <div><dt>Address</dt><dd>{bank.address}</dd></div>}
                {bank.phone && <div><dt>Phone</dt><dd><a href={`tel:${bank.phone}`} onClick={(event) => event.stopPropagation()}>{bank.phone}</a></dd></div>}
                {bank.openingHours && <div><dt>Hours</dt><dd>{bank.openingHours}</dd></div>}
                {website && <div><dt>Website</dt><dd><a href={website} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Visit website</a></dd></div>}
              </dl>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
