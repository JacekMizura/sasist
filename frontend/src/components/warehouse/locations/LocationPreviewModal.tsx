import { useEffect, useMemo, useState } from "react";
import { Loader2, Navigation, X } from "lucide-react";
import {
  getLocationVisualContext,
  type LocationVisualBin,
  type LocationVisualContext,
} from "../../../api/wmsLocationVisualApi";
import { LocationPreviewCarrierContents } from "./LocationPreviewCarrierContents";
import { LocationPreviewInfoPanel } from "./LocationPreviewInfoPanel";
import { LocationPreviewRackView } from "./LocationPreviewRackView";
import { LocationPreviewWarehouseGrid } from "./LocationPreviewWarehouseGrid";

type Props = {
  open: boolean;
  onClose: () => void;
  tenantId: number;
  locationId: number;
  locationCode?: string | null;
  carrierId?: number | null;
};

export function LocationPreviewModal({
  open,
  onClose,
  tenantId,
  locationId,
  locationCode,
  carrierId,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ctx, setCtx] = useState<LocationVisualContext | null>(null);
  const [focusedRackId, setFocusedRackId] = useState<number | null>(null);
  const [selectedBin, setSelectedBin] = useState<LocationVisualBin | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || locationId < 1) {
      setCtx(null);
      setErr(null);
      setFocusedRackId(null);
      setSelectedBin(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void getLocationVisualContext(tenantId, locationId, carrierId)
      .then((data) => {
        if (cancelled) return;
        setCtx(data);
        const activeRack = data.rack_grid.find((c) => c.is_active);
        setFocusedRackId(activeRack?.id ?? data.rack?.id ?? null);
        setSelectedBin(data.rack_bins.find((b) => b.is_active) ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setErr("Nie udało się wczytać podglądu lokalizacji.");
          setCtx(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, locationId, carrierId]);

  const code = useMemo(
    () => (ctx?.location.code || locationCode || "").trim() || `#${locationId}`,
    [ctx, locationCode, locationId],
  );

  const activeOccupancy = useMemo(() => {
    if (!ctx) return undefined;
    return {
      sku: ctx.occupancy.sku_count,
      qty: ctx.occupancy.total_qty,
      percent: ctx.occupancy.capacity_utilization_percent,
    };
  }, [ctx]);

  const contentsForBin = useMemo(() => {
    if (!ctx) return { products: [], label: null as string | null, emptyHint: "" };
    if (selectedBin?.is_active || selectedBin?.code === ctx.location.code) {
      return {
        products: ctx.products,
        label: selectedBin?.code || code,
        emptyHint: "Brak produktów w tej lokalizacji.",
      };
    }
    return {
      products: [],
      label: selectedBin?.code || null,
      emptyHint: "Wybierz aktywną lokalizację (TU), aby zobaczyć zawartość nośnika.",
    };
  }, [ctx, selectedBin, code]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-2">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Nawigacja magazynu ${code}`}
        className="flex h-[100dvh] w-full max-w-[min(98vw,1520px)] flex-col overflow-hidden bg-[#080c12] shadow-[0_0_80px_rgba(0,0,0,0.65)] sm:h-[min(96vh,960px)] sm:rounded-lg sm:border sm:border-slate-700/50"
      >
        {/* Header — command center */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-700/60 bg-[#0c1018] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-cyan-500/70">
              Warehouse navigation
            </p>
            <h2 className="truncate font-mono text-xl font-bold tracking-tight text-white sm:text-2xl">{code}</h2>
            {ctx ? (
              <p className="truncate text-xs text-slate-500">
                {ctx.warehouse.name}
                {ctx.zone.code ? ` · ${ctx.zone.code}` : ""}
                {ctx.zone.aisle ? ` · alejka ${ctx.zone.aisle}` : ""}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-800/80 text-slate-300 transition hover:bg-slate-700 hover:text-white"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin text-cyan-500" />
              <span className="text-sm font-medium">Inicjalizacja digital twin…</span>
            </div>
          ) : err ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="text-sm text-amber-400">{err}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
              >
                Zamknij
              </button>
            </div>
          ) : ctx ? (
            <div className="flex h-full min-h-0 flex-col">
              <section className="min-h-0 flex-[3] p-1 sm:p-1.5">
                <div className="grid h-full min-h-[300px] grid-cols-1 gap-1 sm:gap-1.5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
                  <LocationPreviewWarehouseGrid
                    cells={ctx.rack_grid}
                    warehouseName={ctx.warehouse.name}
                    focusedRackId={focusedRackId}
                    onRackFocus={setFocusedRackId}
                    activeOccupancy={activeOccupancy}
                  />
                  <LocationPreviewRackView
                    bins={ctx.rack_bins}
                    rackName={ctx.rack?.name}
                    selectedBinCode={selectedBin?.code ?? code}
                    onBinSelect={setSelectedBin}
                  />
                </div>
              </section>

              <section className="grid min-h-0 shrink-0 grid-cols-1 gap-1.5 border-t border-slate-800 bg-[#0a0e14] p-1.5 sm:max-h-[32%] sm:grid-cols-2 sm:p-2">
                <LocationPreviewInfoPanel ctx={ctx} locationCode={code} />
                <LocationPreviewCarrierContents
                  products={contentsForBin.products}
                  selectedLabel={contentsForBin.label}
                  emptyHint={contentsForBin.emptyHint}
                  occupancyPercent={ctx.occupancy.capacity_utilization_percent}
                />
              </section>
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-800 bg-[#0c1018] px-4 py-2 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
          >
            Zamknij
          </button>
          <button
            type="button"
            disabled
            title="Wkrótce — integracja z trasą pickera"
            className="inline-flex items-center gap-2 rounded-md bg-cyan-600/40 px-4 py-2 text-sm font-semibold text-cyan-200/60"
          >
            <Navigation className="h-4 w-4" />
            Pokaż trasę
          </button>
        </footer>
      </div>
    </div>
  );
}
