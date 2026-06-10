import { useEffect, useState } from "react";
import { Loader2, MapPin, Navigation, Package, X } from "lucide-react";
import {
  getLocationVisualContext,
  type LocationVisualContext,
} from "../../../api/wmsLocationVisualApi";
import { formatCarrierCode } from "../../../utils/formatCarrierCode";
import { CarrierProductThumb } from "../carriers/CarrierProductThumb";
import { LocationBadge, type WmsLocationBadgeKind } from "../LocationBadge";
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

function formatDateTime(raw?: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("pl-PL");
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-[13px] font-medium text-slate-500">{label}</span>
      <span className="text-right text-[14px] font-semibold text-slate-900">{value || "—"}</span>
    </div>
  );
}

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
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void getLocationVisualContext(tenantId, locationId, carrierId)
      .then((data) => {
        if (!cancelled) setCtx(data);
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

  if (!open) return null;

  const code = (ctx?.location.code || locationCode || "").trim() || `#${locationId}`;
  const carrierLabel = ctx?.carrier ? formatCarrierCode(ctx.carrier.code) : null;
  const badgeKind = (ctx?.occupancy.location_type || "PICK").toUpperCase() as WmsLocationBadgeKind;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Podgląd lokalizacji ${code}`}
        className="flex max-h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
                <MapPin className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div>
                <h2 className="truncate text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                  Lokalizacja {code}
                </h2>
                {ctx ? (
                  <p className="mt-0.5 text-[13px] font-medium text-slate-500">
                    {ctx.warehouse.name}
                    {ctx.zone.code ? ` • Strefa ${ctx.zone.code}` : ""}
                    {ctx.zone.aisle ? ` • Alejka ${ctx.zone.aisle}` : ""}
                    {ctx.zone.level ? ` • Poziom ${ctx.zone.level}` : ""}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-slate-600">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-[15px] font-medium">Ładowanie mapy…</span>
            </div>
          ) : err ? (
            <div className="px-6 py-16 text-center">
              <p className="text-[15px] font-medium text-amber-800">{err}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Zamknij
              </button>
            </div>
          ) : ctx ? (
            <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <section className="space-y-5 border-b border-slate-200 p-4 sm:p-6 lg:border-b-0 lg:border-r">
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Informacje</h3>
                  <div className="mt-2 rounded-xl bg-slate-50/80 px-3 py-2">
                    {carrierLabel ? <InfoRow label="Nośnik" value={carrierLabel} /> : null}
                    <InfoRow label="Strefa" value={ctx.zone.code} />
                    <InfoRow label="Alejka" value={ctx.zone.aisle} />
                    <InfoRow label="Poziom" value={ctx.zone.level} />
                    <InfoRow label="Pozycja" value={ctx.zone.position} />
                    <div className="flex items-center justify-between gap-3 py-1.5">
                      <span className="text-[13px] font-medium text-slate-500">Lokalizacja</span>
                      <LocationBadge code={code} type={badgeKind} layoutSpread />
                    </div>
                    <InfoRow label="Zawartość" value={`SKU: ${ctx.occupancy.sku_count} • ${ctx.occupancy.total_qty} szt.`} />
                    <InfoRow label="Ostatni ruch" value={formatDateTime(ctx.last_movement_at)} />
                  </div>
                </div>

                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Zawartość nośnika</h3>
                  {ctx.products.length === 0 ? (
                    <p className="mt-3 text-[14px] text-slate-500">Brak produktów w tej lokalizacji.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {ctx.products.map((p) => {
                        const name = (p.name || p.sku || "").trim() || `#${p.product_id}`;
                        return (
                          <li key={p.product_id} className="flex items-center gap-3 py-2.5">
                            <CarrierProductThumb imageUrl={p.image_url} alt={name} size="lg" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-semibold text-slate-900">{name}</p>
                              <p className="mt-0.5 font-mono text-[11px] text-slate-500">{p.sku || "—"}</p>
                            </div>
                            <p className="shrink-0 text-[18px] font-black tabular-nums text-slate-900">
                              {p.quantity} szt.
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-3">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Package className="h-4 w-4" strokeWidth={2} />
                    <span className="text-[13px] font-semibold">Pojemność</span>
                  </div>
                  <p className="mt-2 text-[14px] text-slate-700">
                    Zajętość:{" "}
                    <strong>{Math.round(ctx.occupancy.capacity_utilization_percent)}%</strong>
                    {ctx.occupancy.storage_type ? ` • ${ctx.occupancy.storage_type}` : ""}
                  </p>
                </div>
              </section>

              <section className="space-y-5 p-4 sm:p-6">
                <LocationPreviewWarehouseGrid cells={ctx.rack_grid} />
                <LocationPreviewRackView bins={ctx.rack_bins} rackName={ctx.rack?.name} />
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                  <p className="text-[14px] font-bold text-blue-900">Twoja lokalizacja: {code}</p>
                  <p className="mt-1 text-[13px] text-blue-800/90">
                    {ctx.zone.code && ctx.zone.aisle && ctx.zone.level
                      ? `Lokalizacja znajduje się w strefie ${ctx.zone.code}, alejka ${ctx.zone.aisle}, poziom ${ctx.zone.level}.`
                      : "Wskazany regał i poziom na mapie powyżej."}
                  </p>
                </div>
              </section>
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-[14px] font-semibold text-slate-800 hover:bg-slate-50"
          >
            Zamknij
          </button>
          <button
            type="button"
            disabled
            title="Wkrótce — integracja z trasą pickera"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-[14px] font-semibold text-white opacity-60"
          >
            <Navigation className="h-4 w-4" />
            Pokaż trasę
          </button>
        </footer>
      </div>
    </div>
  );
}
