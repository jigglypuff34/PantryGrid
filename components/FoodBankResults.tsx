"use client";

import { KeyboardEvent, useEffect, useRef } from "react";
import type { FoodBank, FoodBankInventory } from "@/lib/types";

export type FoodBankResult = FoodBank & { distanceMiles: number };

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
    notation: value >= 1_000_000 ? "compact" : "standard",
  }).format(value);
}

function getSupplyTone(bank: FoodBank): "full" | "empty" | "mid" | "unknown" {
  if (bank.supplyLevel === "empty" || bank.supplyPercent === 0) return "empty";
  if (bank.supplyLevel === "full" || (typeof bank.supplyPercent === "number" && bank.supplyPercent >= 80)) return "full";
  if (typeof bank.supplyPercent === "number" || bank.supplyLevel) return "mid";
  return "unknown";
}

function renderSupplyLabel(bank: FoodBank) {
  if (typeof bank.supplyPercent === "number" && bank.supplyLevel) return `${bank.supplyPercent}% ${bank.supplyLevel}`;
  if (typeof bank.supplyPercent === "number") return `${bank.supplyPercent}%`;
  return bank.supplyLevel ?? "unknown";
}

export default function FoodBankResults({
  foodBanks, total, selectedId, onSelect, onRequestRefill, canRequestRefill,
  inventories, inventoryLoadingIds, inventoryErrors, loading, error, hasSearched,
}: {
  foodBanks: FoodBankResult[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRequestRefill: (bank: FoodBankResult) => void;
  canRequestRefill: boolean;
  inventories: Record<string, FoodBankInventory>;
  inventoryLoadingIds: string[];
  inventoryErrors: Record<string, string>;
  loading: boolean;
  error: string;
  hasSearched: boolean;
}) {
  const cardRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (selectedId) cardRefs.current.get(selectedId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
        <div><span>Database resources</span><h2>Food banks</h2></div>
        {hasSearched && !loading && !error && <strong>{total} found</strong>}
      </div>

      <div className="results-list" aria-live="polite" aria-busy={loading}>
        {loading && <div className="panel-state"><span className="spinner panel-spinner" />Loading food banks…</div>}
        {!loading && error && <div className="panel-state panel-error"><strong>Search failed</strong><span>{error}</span></div>}
        {!loading && !error && hasSearched && foodBanks.length === 0 && <div className="panel-state"><strong>No food banks found</strong><span>Try a larger radius or a nearby city.</span></div>}
        {!loading && !error && !hasSearched && <div className="panel-state"><strong>Search to see results</strong><span>Select a bank to view supply and simulated inventory.</span></div>}
        {!loading && !error && foodBanks.map((bank) => {
          const selected = selectedId === bank.id;
          const inventory = inventories[bank.id];
          const inventoryLoading = inventoryLoadingIds.includes(bank.id);
          const inventoryError = inventoryErrors[bank.id];
          return (
            <article
              key={bank.id}
              ref={(element) => { if (element) cardRefs.current.set(bank.id, element); else cardRefs.current.delete(bank.id); }}
              className={`result-card${selected ? " selected" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-expanded={selected}
              onClick={() => onSelect(bank.id)}
              onKeyDown={(event) => handleKeyDown(event, bank.id)}
            >
              <div className="result-card-title">
                <div><h3>{bank.name}</h3>{bank.dbaName && <span className="dba-name">DBA {bank.dbaName}</span>}</div>
                <div className="result-card-badges">
                  {(bank.supplyLevel || typeof bank.supplyPercent === "number") && (
                    <span className={`supply-pill supply-${getSupplyTone(bank)}`}><span className="supply-heart" aria-hidden="true">♥</span>{renderSupplyLabel(bank)}</span>
                  )}
                  <span>{bank.distanceMiles.toFixed(1)} mi</span>
                </div>
              </div>
              <div className="bank-badges">
                <span className={`size-badge size-${bank.size.toLowerCase()}`}>{bank.size} bank</span>
                <span className="status-badge">{bank.active === "Yes" ? "Active / recent" : bank.active}</span>
              </div>
              <dl>
                <div><dt>Address</dt><dd>{bank.address}</dd></div>
                {(bank.supplyLevel || typeof bank.supplyPercent === "number") && <div><dt>Supply</dt><dd>{renderSupplyLabel(bank)}</dd></div>}
                {bank.county && <div><dt>County</dt><dd>{bank.county}</dd></div>}
                <div><dt>EIN</dt><dd>{bank.ein}</dd></div>
                <div><dt>Size basis</dt><dd>{bank.sizeBasis}</dd></div>
                <div><dt>Revenue</dt><dd>{formatCurrency(bank.revenueAmount)}</dd></div>
                <div><dt>Assets</dt><dd>{formatCurrency(bank.assetAmount)}</dd></div>
                <div><dt>Source</dt><dd><a href={bank.sourceUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>IRS/NCCS record source</a></dd></div>
              </dl>
              <button type="button" className="result-card-action" disabled={!canRequestRefill} onClick={(event) => { event.stopPropagation(); onRequestRefill(bank); }}>Request refill</button>

              {selected && (
                <section className="inventory-panel" aria-label={`Simulated inventory for ${bank.name}`} onClick={(event) => event.stopPropagation()}>
                  <div className="inventory-heading">
                    <div><span>Simulated inventory</span><strong>From the 2,500-item catalog</strong></div>
                    {inventory && <b>{inventory.itemCount} foods · {inventory.totalUnits} units</b>}
                  </div>
                  {inventoryLoading && <div className="inventory-state"><span className="spinner panel-spinner" />Building a size-based assortment…</div>}
                  {!inventoryLoading && inventoryError && <div className="inventory-state inventory-error">{inventoryError}</div>}
                  {!inventoryLoading && inventory && (
                    <ul className="inventory-list">
                      {inventory.items.map((item) => (
                        <li key={item.id}><div><strong>{item.name}</strong><span>{item.category} · {item.storageType}</span></div><b>{item.quantity}</b></li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </article>
          );
        })}
      </div>
    </aside>
  );
}
