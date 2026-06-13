import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  ClipboardList,
  Clock3,
  Loader2,
  Package,
  Radio,
  Truck,
  Zap,
} from "lucide-react";
import { getOfficeDashboardKpis, type OfficeDashboardKpi } from "../api/officeDashboardApi";
import { getWmsDashboardSummary, type WmsDashboardSummary } from "../api/wmsDashboardApi";
import { useWarehouse } from "../context/WarehouseContext";
import { getBackendPublicOrigin } from "../config/apiBase";
import { DAMAGE_TENANT_ID } from "./damage/damageShared";
import { ORDERS_OPERATIONS_UPDATED_EVENT, WMS_ROUTES, WMS_SHORTAGES_UPDATED_EVENT } from "./wms/wmsRoutes";
import DashboardWarehouseNetworkSection from "../components/dashboard/DashboardWarehouseNetworkSection";

/** Polski plural: „1 zamówienie”, „2 zamówienia”, „5 zamówień”, „24 zamówienia”. */
function ordersCountLabel(n: number): string {
  if (n === 1) return "1 zamówienie";
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return `${n} zamówień`;
  const m10 = n % 10;
  if (m10 >= 2 && m10 <= 4) return `${n} zamówienia`;
  return `${n} zamówień`;
}

function fmtMoney(n: number, fractionDigits: 0 | 2 = 0) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(n);
}

function resolveImg(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) {
    const o = getBackendPublicOrigin();
    return o ? `${o}${u}` : u;
  }
  return u;
}

function pctBar(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.min(100, Math.round((100 * num) / den));
}

function formatActivityTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "medium" }).format(d);
  } catch {
    return "—";
  }
}

function healthLabel(h: WmsDashboardSummary["operational_health"]): { text: string; className: string } {
  switch (h) {
    case "critical":
      return { text: "Krytyczny", className: "border-rose-200 bg-rose-50 text-rose-900" };
    case "attention":
      return { text: "Wymaga uwagi", className: "border-amber-200 bg-amber-50 text-amber-900" };
    default:
      return { text: "Rytm nominalny", className: "border-emerald-200 bg-emerald-50 text-emerald-900" };
  }
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <time className="tabular-nums text-slate-800" dateTime={now.toISOString()}>
      {new Intl.DateTimeFormat("pl-PL", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(now)}
    </time>
  );
}

/** Jasne karty — spójne z resztą panelu (Sellasist / ERP). */
const surfaceCard = "rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const surfaceCardHover =
  "transition-shadow duration-200 hover:border-slate-300 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]";

function BusinessKpiMini({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className={`${surfaceCard} ${surfaceCardHover} flex min-w-[7.5rem] flex-1 flex-col gap-0.5 px-3 py-2.5 sm:min-w-0`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-bold tabular-nums leading-tight text-slate-900">{value}</p>
      {hint ? <p className="text-[10px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

export default function Dashboard() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const [kpi, setKpi] = useState<OfficeDashboardKpi | null>(null);
  const [wms, setWms] = useState<WmsDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const k = await getOfficeDashboardKpis(DAMAGE_TENANT_ID);
      setKpi(k);
      if (warehouseId != null) {
        const w = await getWmsDashboardSummary(DAMAGE_TENANT_ID, warehouseId);
        setWms(w);
      } else {
        setWms(null);
      }
    } catch {
      setErr("Nie udało się wczytać pulpitu.");
      setKpi(null);
      setWms(null);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onOps = () => void load();
    window.addEventListener(WMS_SHORTAGES_UPDATED_EVENT, onOps);
    window.addEventListener(ORDERS_OPERATIONS_UPDATED_EVENT, onOps);
    return () => {
      window.removeEventListener(WMS_SHORTAGES_UPDATED_EVENT, onOps);
      window.removeEventListener(ORDERS_OPERATIONS_UPDATED_EVENT, onOps);
    };
  }, [load]);

  const pickDen = wms != null ? Math.max(0, wms.picking_collected + wms.picking_to_collect) : 0;
  const packDen = wms != null ? Math.max(0, wms.packing_packed + wms.packing_to_pack) : 0;

  const pipeline = useMemo(() => {
    if (!wms) return { segments: [0, 0, 0, 0], raw: [0, 0, 0, 0] as number[] };
    const gathered = Math.max(0, wms.picking_collected);
    const packingQueue = wms.packing_do_spakowania + wms.packing_w_trakcie + wms.packing_braki;
    const ready = wms.packing_spakowane;
    const shipped = Math.max(0, wms.orders_closed_packed_today ?? 0);
    const raw = [gathered, packingQueue, ready, shipped];
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    const segments = raw.map((v) => Math.max(8, Math.round((100 * v) / sum)));
    return { segments, raw };
  }, [wms]);

  const errorAlerts = wms?.alerts?.filter((a) => a.kind === "error") ?? [];
  const warnAlerts = wms?.alerts?.filter((a) => a.kind === "warning") ?? [];
  const infoAlerts = wms?.alerts?.filter((a) => a.kind === "info") ?? [];

  const profitToday = kpi != null ? Number(kpi.gross_profit_today ?? 0) : 0;
  const profitYesterday = kpi != null ? Number(kpi.gross_profit_yesterday ?? 0) : 0;

  return (
    <div className="-mx-4 -mt-4 min-h-0 min-w-0 flex-1 bg-white sm:-mx-6">
      <div className="w-full px-4 py-6 sm:px-6 sm:py-8">
        {err ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
            {err}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-hidden />
            Ładowanie…
          </div>
        ) : null}

        {kpi ? (
          <>
            {/* ——— Business KPIs (first) ——— */}
            <section className="mb-8">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Podsumowanie biznesowe
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
                <div className="flex min-w-0 flex-1 flex-wrap gap-2 sm:contents">
                  <BusinessKpiMini label="Zamówienia dziś" value={String(kpi.orders_today)} />
                  <BusinessKpiMini label="Przychód dziś" value={fmtMoney(kpi.revenue_today)} />
                  <BusinessKpiMini
                    label="Marża dziś"
                    value={fmtMoney(profitToday)}
                    hint="Szacunek z kosztów katalogu"
                  />
                  <BusinessKpiMini label="Śr. wartość zam." value={fmtMoney(kpi.avg_order_value_today, 2)} />
                </div>
                <div
                  className={`${surfaceCard} ${surfaceCardHover} flex min-w-[12rem] flex-1 flex-col gap-1.5 px-3 py-2.5 sm:max-w-xs sm:flex-none lg:max-w-sm`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Wczoraj</p>
                  <p className="text-sm tabular-nums text-slate-800">
                    <span className="font-semibold text-slate-900">{ordersCountLabel(kpi.orders_yesterday)}</span>
                  </p>
                  <p className="text-sm tabular-nums text-slate-700">{fmtMoney(kpi.revenue_yesterday)} przychód</p>
                  <p className="text-sm tabular-nums text-slate-700">{fmtMoney(profitYesterday)} marża</p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <DashboardWarehouseNetworkSection tenantId={DAMAGE_TENANT_ID} />
            </section>
          </>
        ) : null}

        {warehouseId == null && !loading ? (
          <p className="mt-6 text-sm text-slate-600">
            Wybierz magazyn w pasku u góry, aby zobaczyć metryki operacyjne magazynu.
          </p>
        ) : null}

        {wms && warehouseId != null ? (
            <div className="mb-6 border-t border-slate-100 pt-8">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Magazyn</p>
              <header className={`${surfaceCard} mb-8 p-5 sm:p-6`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Centrum operacyjne</h1>
                    <p className="mt-1 text-sm text-slate-600">
                      {warehouse?.name ?? "—"}
                      <span className="text-slate-400"> · ID {warehouseId}</span>
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center lg:justify-end lg:gap-x-6 lg:gap-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <Clock3 className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
                      <LiveClock />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <Radio className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
                      <span>
                        Aktywne sesje:{" "}
                        <strong className="font-semibold tabular-nums text-slate-900">{wms.active_picking_sessions}</strong>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Stan</span>
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${healthLabel(wms.operational_health).className}`}
                      >
                        <Activity className="mr-1.5 h-3.5 w-3.5 opacity-80" strokeWidth={2} aria-hidden />
                        {healthLabel(wms.operational_health).text}
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-xs leading-snug text-slate-600 sm:col-span-2 lg:max-w-xs lg:text-right">
                      <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" strokeWidth={2} aria-hidden />
                      <span>
                        Ostatnia aktywność:{" "}
                        <span className="font-medium text-slate-800">{formatActivityTs(wms.last_activity_at)}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </header>

              <section>
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Priorytet operacyjny</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <Link
                    to={WMS_ROUTES.picking}
                    className={`${surfaceCard} ${surfaceCardHover} border-l-[3px] border-l-blue-500 p-4`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700">Do zebrania</p>
                        <p className="mt-2 text-3xl font-black tabular-nums leading-none text-slate-900">
                          {wms.orders_to_collect}
                        </p>
                        <p className="mt-2 text-[11px] font-medium text-slate-500">zamówień w kolejce zbierania</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
                        <ClipboardList className="h-6 w-6" strokeWidth={2} aria-hidden />
                      </div>
                    </div>
                  </Link>

                  <Link
                    to={WMS_ROUTES.packing}
                    className={`${surfaceCard} ${surfaceCardHover} border-l-[3px] border-l-violet-500 p-4`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Do spakowania</p>
                        <p className="mt-2 text-3xl font-black tabular-nums leading-none text-slate-900">
                          {wms.packing_do_spakowania}
                        </p>
                        <p className="mt-2 text-[11px] font-medium text-slate-500">oczekuje na start pakowania</p>
                      </div>
                      <div className="rounded-lg bg-violet-50 p-2 text-violet-700">
                        <Package className="h-6 w-6" strokeWidth={2} aria-hidden />
                      </div>
                    </div>
                  </Link>

                  <Link
                    to={WMS_ROUTES.packing}
                    className={`${surfaceCard} ${surfaceCardHover} border-l-[3px] border-l-sky-500 p-4`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">W toku</p>
                        <p className="mt-2 text-3xl font-black tabular-nums leading-none text-slate-900">
                          {wms.packing_w_trakcie}
                        </p>
                        <p className="mt-2 text-[11px] font-medium text-slate-500">pakowanie rozpoczęte</p>
                      </div>
                      <div className="rounded-lg bg-sky-50 p-2 text-sky-700">
                        <Loader2 className="h-6 w-6" strokeWidth={2} aria-hidden />
                      </div>
                    </div>
                  </Link>

                  <Link
                    to={WMS_ROUTES.packing}
                    className={`${surfaceCard} ${surfaceCardHover} border-l-[3px] border-l-amber-500 p-4`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Braki</p>
                        <p className="mt-2 text-3xl font-black tabular-nums leading-none text-slate-900">
                          {wms.packing_braki}
                        </p>
                        <p className="mt-2 text-[11px] font-medium text-slate-500">wymagają decyzji / towaru</p>
                      </div>
                      <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
                        <AlertTriangle className="h-6 w-6" strokeWidth={2} aria-hidden />
                      </div>
                    </div>
                  </Link>

                  <Link
                    to="/orders/list"
                    className={`${surfaceCard} ${surfaceCardHover} border-l-[3px] border-l-rose-500 p-4`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-rose-700">Opóźnione</p>
                        <p className="mt-2 text-3xl font-black tabular-nums leading-none text-slate-900">
                          {wms.orders_delayed ?? 0}
                        </p>
                        <p className="mt-2 text-[11px] font-medium text-slate-500">&gt;48h bez statusu DONE</p>
                      </div>
                      <div className="rounded-lg bg-rose-50 p-2 text-rose-700">
                        <Clock3 className="h-6 w-6" strokeWidth={2} aria-hidden />
                      </div>
                    </div>
                  </Link>
                </div>
              </section>

              <section className={`${surfaceCard} mt-8 p-5 sm:p-6`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">Przepływ dzienny</h2>
                    <p className="mt-1 text-xs text-slate-500">Skala względna natężenia pracy</p>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                    <span>
                      Zbieranie:{" "}
                      <strong className="font-semibold text-slate-900">
                        {Math.round(wms.picking_collected)} / {Math.round(pickDen)} szt.
                      </strong>
                    </span>
                    <span>
                      Pakowanie jednostek:{" "}
                      <strong className="font-semibold text-slate-900">
                        {wms.packing_packed} / {packDen || "0"}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="mt-6 flex h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80">
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{ width: `${pipeline.segments[0]}%` }}
                    title={`Zebrane / picki: ${pipeline.raw[0]}`}
                  />
                  <div
                    className="bg-violet-500 transition-all"
                    style={{ width: `${pipeline.segments[1]}%` }}
                    title={`Pakowanie (kolejka): ${pipeline.raw[1]}`}
                  />
                  <div
                    className="bg-sky-500 transition-all"
                    style={{ width: `${pipeline.segments[2]}%` }}
                    title={`Gotowe (spakowane): ${pipeline.raw[2]}`}
                  />
                  <div
                    className="bg-slate-400 transition-all"
                    style={{ width: `${pipeline.segments[3]}%` }}
                    title={`Zamknięte dziś (DONE + packed): ${pipeline.raw[3]}`}
                  />
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      label: "Zebrane",
                      sub: "picki / pozostało",
                      value: `${Math.round(wms.picking_collected)} szt.`,
                      extra: `${Math.round(wms.picking_to_collect)} do pobrania`,
                      icon: Boxes,
                      bar: pctBar(wms.picking_collected, pickDen),
                      fill: "bg-emerald-500",
                    },
                    {
                      label: "Pakowanie",
                      sub: "w kolejce operacyjnej",
                      value: String(wms.packing_do_spakowania + wms.packing_w_trakcie + wms.packing_braki),
                      extra: `${wms.packing_do_spakowania} start · ${wms.packing_w_trakcie} tok · ${wms.packing_braki} brak`,
                      icon: Package,
                      bar: pctBar(wms.packing_packed, packDen || 1),
                      fill: "bg-violet-500",
                    },
                    {
                      label: "Gotowe",
                      sub: "spakowane (w kolejce)",
                      value: String(wms.packing_spakowane),
                      extra: "gotowe do zamknięcia / wysyłki",
                      icon: Truck,
                      bar: pctBar(wms.packing_spakowane, Math.max(1, wms.packing_spakowane + wms.packing_do_spakowania)),
                      fill: "bg-sky-500",
                    },
                    {
                      label: "Wysłane / zamknięte",
                      sub: "panel DONE + packed dziś",
                      value: String(wms.orders_closed_packed_today ?? 0),
                      extra: "operacyjne domknięcie dnia",
                      icon: Zap,
                      bar: Math.min(
                        100,
                        Math.round(
                          100 *
                            (wms.orders_closed_packed_today /
                              Math.max(1, wms.orders_closed_packed_today + wms.packing_spakowane)),
                        ),
                      ),
                      fill: "bg-slate-400",
                    },
                  ].map((step) => (
                    <div
                      key={step.label}
                      className="rounded-xl border border-slate-100 bg-white p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{step.sub}</p>
                          <p className="mt-0.5 text-sm font-semibold text-slate-900">{step.label}</p>
                        </div>
                        <step.icon className="h-5 w-5 text-slate-400" strokeWidth={2} aria-hidden />
                      </div>
                      <p className="mt-3 text-2xl font-black tabular-nums text-slate-900">{step.value}</p>
                      <p className="mt-1 text-[11px] leading-snug text-slate-500">{step.extra}</p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${step.fill}`} style={{ width: `${step.bar}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-10">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Alerty i blokady</h2>
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className={`${surfaceCard} border-amber-100 bg-amber-50/40 p-4`}>
                    <div className="flex items-center gap-2 text-amber-950">
                      <Boxes className="h-5 w-5 shrink-0 text-amber-600" strokeWidth={2} aria-hidden />
                      <span className="text-sm font-bold">Braki magazynowe</span>
                    </div>
                    <p className="mt-3 text-3xl font-black tabular-nums text-slate-900">{wms.packing_braki}</p>
                    <p className="mt-1 text-xs text-amber-900/85">Zamówienia w kolejce pakowania z niedoborem towaru</p>
                    <Link
                      to={WMS_ROUTES.packing}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-amber-800 hover:underline"
                    >
                      Otwórz pakowanie <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>

                  <div className={`${surfaceCard} border-rose-100 bg-rose-50/40 p-4`}>
                    <div className="flex items-center gap-2 text-rose-950">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" strokeWidth={2} aria-hidden />
                      <span className="text-sm font-bold">Opóźnione zamówienia</span>
                    </div>
                    <p className="mt-3 text-3xl font-black tabular-nums text-slate-900">{wms.orders_delayed ?? 0}</p>
                    <p className="mt-1 text-xs text-rose-900/85">
                      Ponad 48 h od daty zamówienia bez statusu panelu DONE
                    </p>
                    <Link
                      to="/orders/list"
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-rose-800 hover:underline"
                    >
                      Lista zamówień <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>

                  <div className={`${surfaceCard} p-4`}>
                    <div className="flex items-center gap-2 text-slate-800">
                      <Radio className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
                      <span className="text-sm font-bold">Integracje</span>
                    </div>
                    {errorAlerts.length ? (
                      <ul className="mt-3 space-y-2 text-sm text-rose-800">
                        {errorAlerts.map((a, i) => (
                          <li key={`e-${i}`} className="leading-snug">
                            {a.message}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-slate-600">Brak zgłoszonych błędów integracji w tym widoku.</p>
                    )}
                    <p className="mt-3 text-[11px] text-slate-500">Szczegółowe logi — rozszerzenie API.</p>
                  </div>
                </div>

                {(warnAlerts.length > 0 || infoAlerts.length > 0) && (
                  <div className="mt-4 space-y-2">
                    {[...warnAlerts, ...infoAlerts].map((a, i) => (
                      <div
                        key={`a-${i}`}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          a.kind === "warning"
                            ? "border-amber-200 bg-amber-50/80 text-amber-950"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        {a.message}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="mt-12">
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">Najczęściej zbierane</h2>
                    <p className="text-xs text-slate-500">14 dni · kliknięcie otwiera edycję produktu</p>
                  </div>
                </div>
                <div className="-mx-1 flex gap-4 overflow-x-auto pb-2 pt-1 [-webkit-overflow-scrolling:touch]">
                  {wms.top_picked_products.length === 0 ? (
                    <p className="px-1 text-sm text-slate-500">Brak danych z picków.</p>
                  ) : (
                    wms.top_picked_products.map((p) => {
                      const src = resolveImg(p.image_url);
                      return (
                        <Link
                          key={p.product_id}
                          to={`/products/${p.product_id}/edit`}
                          className={`${surfaceCard} ${surfaceCardHover} group flex w-[12.5rem] shrink-0 flex-col overflow-hidden`}
                        >
                          <div className="relative aspect-[5/4] w-full bg-white">
                            {src ? (
                              <img
                                src={src}
                                alt=""
                                className="h-full w-full object-contain p-4 transition duration-300 group-hover:scale-[1.02]"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-slate-200">
                                <Package className="h-14 w-14 opacity-60" strokeWidth={1.25} aria-hidden />
                              </div>
                            )}
                            <span className="absolute right-3 top-3 rounded-md border border-slate-200/90 bg-white/95 px-2 py-1 text-[11px] font-bold tabular-nums text-slate-900 shadow-sm backdrop-blur-sm">
                              {Number.isInteger(p.pick_qty) ? p.pick_qty : p.pick_qty.toFixed(1)} szt.
                            </span>
                          </div>
                          <div className="border-t border-slate-100 px-4 py-3.5">
                            <p className="line-clamp-2 min-h-[2.75rem] text-[13px] font-semibold leading-snug text-slate-900">
                              {p.name}
                            </p>
                            <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                              Produkt #{p.product_id}
                            </p>
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
        ) : null}
      </div>
    </div>
  );
}
