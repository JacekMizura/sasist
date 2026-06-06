import { useMemo } from "react";
import type { LayoutState, RackState, BinState, WarehouseProduct } from "../../types/warehouse";
import {
  formatVolume,
  binUsedVolumeDm3,
  binVolumeDm3,
  getRackDisplayId,
  isBinDirectionRtl,
} from "./warehouseUtils";
import { resolveWarehouseLocation } from "../../utils/resolvedWarehouseLocation";

/** Slide-over panel content for elevation (side) view + inventory list. Used only in Layout tab; onAddProduct/onEditProduct allow adding/editing products. */
export function ElevationPanel({
  layout,
  rack,
  products,
  selectedBinForFilter,
  setSelectedBinForFilter,
  onAddProduct,
  onEditProduct,
}: {
  layout?: LayoutState | null;
  rack: RackState;
  products: WarehouseProduct[];
  selectedBinForFilter: { level_index: number; segment_index: number } | null;
  setSelectedBinForFilter: (v: { level_index: number; segment_index: number } | null) => void;
  onAddProduct?: () => void;
  onEditProduct?: (productId: string) => void;
}) {
  const binDirectionRtl = useMemo(() => isBinDirectionRtl(layout, rack), [layout, rack]);

  const binsByLevel = new Map<number, BinState[]>();
  for (const b of rack.bins) {
    if (!binsByLevel.has(b.level_index)) binsByLevel.set(b.level_index, []);
    binsByLevel.get(b.level_index)!.push(b);
  }
  for (let lev = 0; lev < rack.levels; lev++) {
    if (!binsByLevel.has(lev)) binsByLevel.set(lev, []);
  }
  const used = rack.used_dm3 ?? rack.bins.reduce((s, b) => s + binUsedVolumeDm3(b), 0);
  const total = rack.total_capacity_dm3 ?? rack.bins.reduce((s, b) => s + binVolumeDm3(b, rack), 0);
  const filteredBin = selectedBinForFilter
    ? rack.bins.find((b) => b.level_index === selectedBinForFilter.level_index && b.segment_index === selectedBinForFilter.segment_index)
    : null;
  const binLabel = filteredBin ? (filteredBin.label ?? filteredBin.location_id ?? "") : null;
  const rackBinLabels = new Set(rack.bins.map((b) => (b.label ?? b.location_id ?? "").trim()).filter(Boolean));
  const rackBinUUIDs = new Set(rack.bins.map((b) => b.locationUUID).filter(Boolean));
  const productsToShow = binLabel
    ? products.filter((p) => {
        if (p.assignedLocations?.length) {
          const bin = rack.bins.find((b) => (b.label ?? b.location_id) === binLabel);
          return bin?.locationUUID && p.assignedLocations.some((a) => a.locationUUID === bin.locationUUID);
        }
        return p.location_id === binLabel;
      })
    : products.filter((p) => {
        if (p.assignedLocations?.length)
          return p.assignedLocations.some((a) => rackBinUUIDs.has(a.locationUUID));
        return p.location_id != null && rackBinLabels.has(p.location_id);
      });

  const occupancyPct = total > 0 ? (used / total) * 100 : 0;
  const rackLabel = `Regał ${getRackDisplayId(rack, layout ?? undefined)}`;

  return (
    <>
      <div className="mb-3 p-2 rounded-lg bg-slate-50 border border-[#E2E8F0]">
        <p className="text-[10px] text-slate-500 uppercase mb-1">{rackLabel} – zajętość</p>
        <p className="text-sm font-mono text-[#1E293B]">{formatVolume(used)} / {formatVolume(total)} dm³</p>
        <div className="mt-1 h-2 rounded-full bg-slate-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${occupancyPct <= 50 ? "bg-emerald-500" : occupancyPct <= 80 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${Math.min(100, occupancyPct)}%` }}
          />
        </div>
        <p className="text-[9px] text-slate-500 mt-0.5">Zielony 0–50% · Żółty 50–80% · Czerwony 80–100%</p>
      </div>
      <p className="text-[10px] text-slate-400 mb-2">Kliknij lokalizację, aby filtrować produkty.</p>
      <div className="space-y-3">
        {Array.from({ length: rack.levels }, (_, lev) => lev)
          .reverse()
          .map((lev) => (
          <div key={lev} className="border border-[#E2E8F0] rounded-lg p-2 bg-slate-50">
            <div className="text-[10px] font-bold text-slate-600 uppercase mb-2">Poziom {lev + 1}</div>
            <div className="flex flex-wrap gap-1">
              {(() => {
                const binsSorted = [...(binsByLevel.get(lev) ?? [])].sort((a, b) => a.segment_index - b.segment_index);
                const binsForDisplay = binDirectionRtl ? [...binsSorted].reverse() : binsSorted;
                return binsForDisplay.map((b) => {
                const vol = binVolumeDm3(b, rack);
                const pct = vol > 0 ? (binUsedVolumeDm3(b) / vol) * 100 : 0;
                const fillColor = pct <= 50 ? "bg-emerald-500" : pct <= 80 ? "bg-amber-500" : "bg-red-500";
                const borderColor = pct <= 50 ? "border-emerald-400" : pct <= 80 ? "border-amber-400" : "border-red-400";
                const isSelected =
                  selectedBinForFilter?.level_index === b.level_index && selectedBinForFilter?.segment_index === b.segment_index;
                const isPrimary = b.storage_type !== "reserve";
                const isLow = pct < 25;
                const hasReserveInRack = rack.bins.some((x) => x.storage_type === "reserve");
                const needReplenishment = isPrimary && isLow && hasReserveInRack;
                const displayLoc = layout ? resolveWarehouseLocation(rack, b, layout).label : resolveWarehouseLocation(rack, b, null).label;
                return (
                  <button
                    key={b.locationUUID ?? `${b.level_index}-${b.segment_index}-${b.label}`}
                    type="button"
                    onClick={() => setSelectedBinForFilter(isSelected ? null : { level_index: b.level_index, segment_index: b.segment_index })}
                    className={`w-14 rounded border px-1 py-1 text-[10px] font-mono text-left ${isSelected ? "ring-2 ring-cyan-500 border-cyan-500 bg-cyan-50" : `bg-white border-[#E2E8F0] ${!isSelected ? borderColor : ""} text-[#1E293B]`}`}
                    title={`${displayLoc}: ${pct.toFixed(0)}% (${formatVolume(binUsedVolumeDm3(b))} / ${formatVolume(vol)} dm³)${needReplenishment ? " · Wymaga uzupełnienia" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-0.5">
                      <span className="truncate">{displayLoc}</span>
                      {needReplenishment && (
                        <span className="shrink-0 text-amber-400" title="Wymaga uzupełnienia z rezerwy">
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 mt-0.5 rounded-full bg-slate-600 overflow-hidden">
                      <div className={`h-full ${fillColor} rounded-full transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <div className="text-[9px] text-slate-500 font-medium">{pct.toFixed(2)}%</div>
                  </button>
                );
              });
              })()}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-[#E2E8F0]">
        <h4 className="text-xs font-bold text-slate-600 uppercase mb-2">
          {filteredBin
            ? `Produkty w lokalizacji ${resolveWarehouseLocation(rack, filteredBin, layout).label}`
            : "Produkty w regale"}
        </h4>
        {filteredBin && (
          <button type="button" onClick={() => setSelectedBinForFilter(null)} className="text-[10px] text-cyan-600 hover:underline mb-2">
            Pokaż wszystkie lokalizacje
          </button>
        )}
        {onAddProduct && (
          <button type="button" onClick={onAddProduct} className="mb-2 px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-500">
            Dodaj produkt
          </button>
        )}
        <div className="space-y-2">
          {productsToShow.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/60 p-2">
              <div className="w-10 h-10 rounded bg-slate-700 shrink-0 flex items-center justify-center text-slate-500 text-[10px]">
                {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover rounded" /> : "—"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[#1E293B] text-xs font-semibold truncate">{p.name}</div>
                <div className="text-[10px] text-slate-500">SKU: {p.sku} · EAN: {p.ean}</div>
                <div className="text-[10px] text-slate-600 mt-0.5">Sztuki: <span className="font-mono">{p.quantity}</span> · Objętość: <span className="font-mono">{formatVolume(p.volume_dm3)} dm³</span></div>
              </div>
              {onEditProduct && (
                <button type="button" onClick={() => onEditProduct(p.id)} className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-cyan-600 hover:bg-slate-700" title="Edytuj produkt">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
