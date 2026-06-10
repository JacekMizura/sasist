import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Navigation, X } from "lucide-react";
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
        const activeBin = data.rack_bins.find((b) => b.is_active) ?? null;
        setSelectedBin(activeBin);
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

  const code = useMemo(() => {
    return (ctx?.location.code || locationCode || "").trim() || `#${locationId}`;
  }, [ctx, locationCode, locationId]);

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
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-3">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Podgląd lokalizacji ${code}`}
        className="flex h-[100dvh] w-full max-w-[min(96vw,1400px)] flex-col overflow-hidden rounded-t-2xl bg-[#f1f5f9] shadow-2xl sm:h-[min(94vh,920px)] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-300/80 bg-white px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-md">
              <MapPin className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black tracking-tight text-slate-900 sm:text-xl">
                Nawigacja magazynu · {code}
              </h2>
              {ctx ? (
                <p className="truncate text-xs font-medium text-slate-500">
                  {ctx.warehouse.name}
                  {ctx.zone.code ? ` · ${ctx.zone.code}` : ""}
                  {ctx.zone.aisle ? ` · alejka ${ctx.zone.aisle}` : ""}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-slate-600">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm font-medium">Ładowanie planu magazynu…</span>
            </div>
          ) : err ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-medium text-amber-800">{err}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Zamknij
              </button>
            </div>
          ) : ctx ? (
            <div className="flex h-full min-h-0 flex-col">
              {/* MAPA MAGAZYNU — ~72% wysokości */}
              <section className="min-h-0 flex-[3] border-b border-slate-300/70 p-2 sm:p-3">
                <div className="grid h-full min-h-[280px] grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-3">
                  <LocationPreviewWarehouseGrid
                    cells={ctx.rack_grid}
                    warehouseName={ctx.warehouse.name}
                    focusedRackId={focusedRackId}
                    onRackFocus={setFocusedRackId}
                    activeOccupancy={activeOccupancy}
                    className="min-h-[240px]"
                  />
                  <LocationPreviewRackView
                    bins={ctx.rack_bins}
                    rackName={ctx.rack?.name}
                    selectedBinCode={selectedBin?.code ?? code}
                    onBinSelect={setSelectedBin}
                    className="min-h-[240px]"
                  />
                </div>
              </section>

              {/* INFO + ZAWARTOŚĆ */}
              <section className="grid min-h-0 shrink-0 grid-cols-1 gap-2 p-2 sm:max-h-[34%] sm:grid-cols-2 sm:p-3">
                <LocationPreviewInfoPanel ctx={ctx} locationCode={code} />
                <LocationPreviewCarrierContents
                  products={contentsForBin.products}
                  selectedLabel={contentsForBin.label}
                  emptyHint={contentsForBin.emptyHint}
                />
              </section>
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-300/80 bg-white px-4 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Zamknij
          </button>
          <button
            type="button"
            disabled
            title="Wkrótce — integracja z trasą pickera"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white opacity-50"
          >
            <Navigation className="h-4 w-4" />
            Pokaż trasę
          </button>
        </footer>
      </div>
    </div>
  );
}
