import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import type { LayoutState } from "../../../types/warehouse";
import { layoutService } from "../../../services/layoutService";
import { layoutStateFromWarehouseApiPayload } from "../../../pages/Products/layoutStateFromWarehouseApi";
import {
  getLocationVisualContext,
  type LocationVisualContext,
} from "../../../api/wmsLocationVisualApi";
import { LocationPreviewCarrierContents } from "./LocationPreviewCarrierContents";
import { LocationPreviewInfoPanel } from "./LocationPreviewInfoPanel";
import { findRackInLayout, LocationPreviewLayoutMap } from "./LocationPreviewLayoutMap";
import { LocationPreviewRackFrontView } from "./LocationPreviewRackFrontView";
import { storageTypeLabelPl } from "./locationPreviewVisual";

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
  const [layout, setLayout] = useState<LayoutState | null>(null);
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);

  const activeRackId = ctx?.rack?.id ?? ctx?.rack_grid.find((c) => c.is_active)?.id ?? null;
  const activeAisle =
    ctx?.rack?.aisle_letter?.trim() ||
    ctx?.rack_grid.find((c) => c.is_active)?.aisle_letter?.trim() ||
    ctx?.zone.aisle?.trim() ||
    null;

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
      setLayout(null);
      setLayoutError(null);
      setLayoutLoading(false);
      setErr(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);

    void getLocationVisualContext(tenantId, locationId, carrierId)
      .then(async (data) => {
        if (cancelled) return;
        setCtx(data);

        setLayoutLoading(true);
        setLayoutError(null);
        try {
          const res = await layoutService.getLayout({
            tenant_id: tenantId,
            warehouse_id: data.warehouse.id,
          });
          if (cancelled) return;
          const payload = res.data as { layout?: Record<string, unknown> } | undefined;
          const d = (payload?.layout ?? res.data ?? {}) as Record<string, unknown>;
          if (d && typeof d === "object") {
            setLayout(layoutStateFromWarehouseApiPayload(d, data.warehouse.id));
          } else {
            setLayout(null);
            setLayoutError("Brak danych layoutu magazynu.");
          }
        } catch {
          if (!cancelled) {
            setLayout(null);
            setLayoutError("Nie udało się wczytać planu magazynu.");
          }
        } finally {
          if (!cancelled) setLayoutLoading(false);
        }
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

  const locationUuid = (ctx?.location.location_uuid ?? "").trim() || null;

  const rackState = useMemo(
    () => findRackInLayout(layout, activeRackId, ctx?.rack?.name),
    [layout, activeRackId, ctx?.rack?.name],
  );

  const selectedBinLocation = useMemo(() => {
    if (!rackState || !locationUuid) return null;
    const bin = rackState.bins.find(
      (b) => (b.locationUUID ?? "").trim() === locationUuid || (b.label ?? "").trim() === code,
    );
    if (!bin) return null;
    return { level_index: bin.level_index, segment_index: bin.segment_index };
  }, [rackState, locationUuid, code]);

  const typeLabel = storageTypeLabelPl(ctx?.occupancy.storage_type, ctx?.occupancy.location_type);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-3 sm:p-5 lg:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Podgląd lokalizacji ${code}`}
        className="flex max-h-[94vh] w-full max-w-[min(1760px,calc(100vw-1.5rem))] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm">
              <MapPin className="h-5 w-5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-slate-900">Lokalizacja {code}</h2>
              {ctx ? (
                <p className="mt-0.5 truncate text-sm text-slate-600">
                  {ctx.warehouse.name}
                  {typeLabel ? ` · ${typeLabel}` : ""}
                  {ctx.zone.aisle ? ` · alejka ${ctx.zone.aisle}` : ""}
                  {ctx.rack?.name ? ` · ${ctx.rack.name}` : ""}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-slate-600">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              <span className="text-sm">Ładowanie…</span>
            </div>
          ) : err ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <p className="text-sm text-red-700">{err}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Zamknij
              </button>
            </div>
          ) : ctx ? (
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(320px,0.9fr)_minmax(420px,1.2fr)_minmax(320px,0.95fr)]">
              <div className="flex min-h-[280px] flex-col gap-3 overflow-hidden border-b border-slate-100 p-4 xl:min-h-0 xl:border-b-0 xl:border-r">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <LocationPreviewLayoutMap
                    tenantId={tenantId}
                    warehouseId={ctx.warehouse.id}
                    locationUuid={locationUuid}
                    activeRackId={activeRackId}
                    activeAisleLetter={activeAisle}
                    layout={layout}
                    layoutLoading={layoutLoading}
                    layoutError={layoutError}
                    className="h-full min-h-[240px] overflow-hidden"
                  />
                </div>
                <LocationPreviewInfoPanel ctx={ctx} locationCode={code} className="max-h-[220px] shrink-0 xl:max-h-[260px]" />
              </div>

              <div className="flex min-h-[360px] flex-col overflow-hidden border-b border-slate-100 p-4 xl:min-h-0 xl:border-b-0 xl:border-r">
                <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="shrink-0 border-b border-slate-100 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Rzut regału</p>
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {rackState?.name ?? ctx.rack?.name ?? "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Wszystkie poziomy i pozycje · góra = wyższy poziom
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden p-4">
                    {rackState ? (
                      <LocationPreviewRackFrontView
                        rack={rackState}
                        layout={layout}
                        selectedLocation={selectedBinLocation}
                        activeLocationUuid={locationUuid}
                        activeLocationCode={code}
                        rackBins={ctx.rack_bins}
                        className="h-full w-full"
                      />
                    ) : (
                      <p className="py-8 text-center text-sm text-slate-500">Brak regału w projekcie magazynu.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="min-h-[280px] overflow-hidden p-4 xl:min-h-0">
                <LocationPreviewCarrierContents
                  products={ctx.products}
                  selectedLabel={code}
                  occupancy={ctx.occupancy}
                  className="h-full min-h-[240px]"
                />
              </div>
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 justify-end border-t border-slate-100 px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Zamknij
          </button>
        </footer>
      </div>
    </div>
  );
}
