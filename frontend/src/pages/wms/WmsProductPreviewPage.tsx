import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { getWmsProductView, type WmsProductViewResponseApi } from "../../api/wmsProductViewApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { WmsProductPreviewNavState } from "./wmsPickingFlowTypes";
import { formatWarehouseLocationTypeLabel } from "../../utils/warehouseLocationTypeLabels";
import { WMS_ROUTES } from "./wmsRoutes";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

function fmtDim(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${fmtQty(n)} cm`;
}

function badgeClass(badge: string): string {
  const b = badge.toUpperCase();
  if (b === "PICK" || b === "START" || b === "PODSTAWOWA") return "bg-emerald-100 text-emerald-900 border-emerald-300";
  if (b === "OVERSTOCK" || b === "STORAGE" || b === "ZAPASOWA") return "bg-amber-100 text-amber-950 border-amber-300";
  if (b === "FLOOR") return "bg-slate-200 text-slate-900 border-slate-400";
  if (b === "DOCK" || b === "PACK" || b === "Przyjęcie") return "bg-sky-100 text-sky-950 border-sky-300";
  return "bg-violet-100 text-violet-950 border-violet-300";
}

export default function WmsProductPreviewPage() {
  const { productId: productIdParam } = useParams();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { setActiveDocument, setScannerInputPlaceholder } = useWmsScanner();

  const nav = routerLocation.state as WmsProductPreviewNavState | null;
  const productId = Number(productIdParam);

  const [data, setData] = useState<WmsProductViewResponseApi | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [incompleteOpen, setIncompleteOpen] = useState(false);

  const load = useCallback(async () => {
    if (warehouseId == null || !Number.isFinite(productId) || productId <= 0) {
      setData(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const d = await getWmsProductView(DAMAGE_TENANT_ID, warehouseId, productId);
      setData(d);
    } catch {
      setErr("Nie udało się wczytać podglądu produktu.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Podgląd produktu" });
    setScannerInputPlaceholder("Inny EAN — przełącz produkt");
    return () => {
      setActiveDocument(null);
    };
  }, [setActiveDocument, setScannerInputPlaceholder]);

  const goBack = () => {
    if (nav?.returnPath) {
      navigate(nav.returnPath, { state: nav.returnState ?? undefined });
      return;
    }
    if (nav?.pickingSession) {
      navigate(WMS_ROUTES.pickingProducts, { state: { pickingSession: nav.pickingSession } });
      return;
    }
    navigate(WMS_ROUTES.productPreviewRoot);
  };

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center bg-white px-6 py-12 text-center">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-950">
          Wybierz magazyn w pasku u góry.
        </p>
      </div>
    );
  }

  const L = data?.logistics;
  const P = data?.package;

  return (
    <div className="min-h-full bg-white px-3 py-4 pb-28 sm:px-5 sm:py-6">
      <div className="w-full">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={goBack}
            className="min-h-[48px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
          >
            ← Wróć
          </button>
          <Link
            to={WMS_ROUTES.productDataCompletion}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-amber-950 hover:bg-amber-100"
          >
            <AlertTriangle size={16} strokeWidth={2.5} />
            Produkty z brakującymi danymi
          </Link>
        </div>

        {loading ? <p className="py-8 text-center text-sm font-medium text-slate-500">Ładowanie…</p> : null}
        {err ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">{err}</p>
        ) : null}

        {data ? (
          <>
            <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-6 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:items-start sm:p-6">
                <div className="mx-auto flex aspect-square w-full max-w-[min(100%,20rem)] items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50 sm:mx-0">
                  {data.image ? (
                    <img src={data.image} alt="" className="max-h-full max-w-full object-contain" loading="eager" />
                  ) : (
                    <span className="px-4 text-center text-sm font-medium text-slate-400">Brak zdjęcia</span>
                  )}
                </div>
                <div className="min-w-0 text-center sm:pt-1 sm:text-left">
                  <h1 className="text-lg font-bold leading-snug text-slate-900 sm:text-xl">{data.name}</h1>
                  <p className="mt-3 font-mono text-sm text-slate-700">
                    <span className="font-semibold text-slate-500">EAN</span> {data.ean ?? "—"}
                  </p>
                  <p className="mt-1 font-mono text-sm text-slate-700">
                    <span className="font-semibold text-slate-500">SKU</span> {data.sku ?? "—"}
                  </p>
                </div>
              </div>
              <div className="border-t border-indigo-200 bg-indigo-50 px-4 py-5 sm:px-6">
                <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-indigo-800">Stan całkowity</p>
                <p className="mt-1 text-center text-4xl font-black tabular-nums text-indigo-950 sm:text-5xl">
                  {fmtQty(data.total_stock)}
                </p>
                <p className="mt-1 text-center text-sm font-medium text-indigo-900/80">szt. w magazynie</p>
              </div>
            </header>

            <section className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Lokalizacje</h2>
              {data.locations.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">Brak stanów w wybranym magazynie.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.locations.map((loc) => (
                    <li
                      key={loc.location_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-base font-bold text-slate-900">{loc.code}</p>
                        {loc.location_type && loc.location_type !== "NORMAL" ? (
                          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            {formatWarehouseLocationTypeLabel(loc.location_type)}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${badgeClass(loc.badge)}`}
                        >
                          {formatWarehouseLocationTypeLabel(loc.badge)}
                        </span>
                        <span className="tabular-nums text-lg font-bold text-slate-900">{fmtQty(loc.quantity)} szt.</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Logistyka (jednostka)</h2>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-slate-500">Masa</dt>
                  <dd className="font-semibold text-slate-900">
                    {L?.weight_kg != null && Number.isFinite(L.weight_kg) ? `${fmtQty(L.weight_kg)} kg` : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-slate-500">Objętość</dt>
                  <dd className="font-semibold text-slate-900">
                    {L?.volume_dm3 != null && Number.isFinite(L.volume_dm3) ? `${fmtQty(L.volume_dm3)} dm³` : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 sm:col-span-2">
                  <dt className="text-slate-500">Wymiary (L × W × H)</dt>
                  <dd className="font-mono font-semibold text-slate-900">
                    {fmtDim(L?.length_cm)} × {fmtDim(L?.width_cm)} × {fmtDim(L?.height_cm)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 sm:col-span-2">
                  <dt className="text-slate-500">Jednostka</dt>
                  <dd className="font-semibold text-slate-900">{L?.unit?.trim() ? L.unit : "—"}</dd>
                </div>
              </dl>
            </section>

            <section className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Opakowanie zbiorcze (karton)</h2>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 sm:col-span-2">
                  <dt className="text-slate-500">EAN kartonu</dt>
                  <dd className="font-mono font-semibold text-slate-900">{P?.carton_ean ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-slate-500">Ilość / karton</dt>
                  <dd className="font-semibold text-slate-900">
                    {P?.units_per_carton != null && Number.isFinite(P.units_per_carton) ? fmtQty(P.units_per_carton) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-slate-500">Masa kartonu</dt>
                  <dd className="font-semibold text-slate-900">
                    {P?.carton_weight_kg != null && Number.isFinite(P.carton_weight_kg)
                      ? `${fmtQty(P.carton_weight_kg)} kg`
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 sm:col-span-2">
                  <dt className="text-slate-500">Objętość kartonu</dt>
                  <dd className="font-semibold text-slate-900">
                    {P?.carton_volume_dm3 != null && Number.isFinite(P.carton_volume_dm3)
                      ? `${fmtQty(P.carton_volume_dm3)} dm³`
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 sm:col-span-2">
                  <dt className="text-slate-500">Wymiary kartonu</dt>
                  <dd className="font-mono font-semibold text-slate-900">
                    {fmtDim(P?.carton_length_cm)} × {fmtDim(P?.carton_width_cm)} × {fmtDim(P?.carton_height_cm)}
                  </dd>
                </div>
              </dl>
            </section>
          </>
        ) : null}
      </div>

    </div>
  );
}
