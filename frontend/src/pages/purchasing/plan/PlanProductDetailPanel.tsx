import { memo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PurchasingAlertEvent } from "../../../api/purchasingAlertsApi";
import { fetchPurchasingForecast, type PurchasingForecastPayload } from "../../../api/purchasingForecastApi";
import type { PurchasingSegmentRow } from "../../../api/purchasingSegmentsApi";
import type { ReplenishmentRow } from "../../../api/purchasingReplenishmentApi";
import { PurchasingProductThumbnail } from "../../../modules/purchasing/ui";
import { fmtShortDate, numFmt } from "./planFormatters";

type Props = {
  row: ReplenishmentRow;
  segment: PurchasingSegmentRow | null;
  alerts: PurchasingAlertEvent[];
  tenantId: number;
  warehouseId: number | null;
  onClose: () => void;
  formatQty: (unit: string | null | undefined, v: number | null | undefined) => string;
};

function severityClass(sev: string): string {
  switch (sev) {
    case "critical":
      return "bg-red-50 text-red-800 ring-red-200";
    case "warning":
      return "bg-amber-50 text-amber-950 ring-amber-200";
    default:
      return "bg-sky-50 text-sky-900 ring-sky-200";
  }
}

function PlanProductDetailPanelInner({ row, segment, alerts, tenantId, warehouseId, onClose, formatQty }: Props) {
  const [forecast, setForecast] = useState<PurchasingForecastPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchPurchasingForecast({
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      product_id: row.product_id,
      range_days: 90,
    })
      .then((d) => {
        if (!cancelled) setForecast(d);
      })
      .catch(() => {
        if (!cancelled) setForecast(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row.product_id, tenantId, warehouseId]);

  const detail = forecast?.product_detail;
  const unit = detail?.unit ?? row.product_unit ?? null;
  const trend = forecast?.charts.sales_trend ?? [];

  return (
    <aside
      className="flex w-full max-w-[420px] shrink-0 flex-col border-l border-slate-200 bg-white"
      aria-label="Szczegóły produktu w planie zakupów"
    >
      <header className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Wybrany produkt</p>
          <h2 className="truncate text-sm font-semibold text-slate-900">{row.product_name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          aria-label="Zamknij panel"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        <div className="flex gap-3">
          <PurchasingProductThumbnail
            size="md"
            imageUrl={row.image_url}
            name={row.product_name}
            sku={row.sku}
            stock={row.current_stock}
            incomingQty={row.incoming_qty}
            unit={unit}
            hoverPreview={false}
          />
          <div className="min-w-0 text-xs text-slate-600">
            <p>SKU: {row.sku ?? "—"}</p>
            <p>EAN: {row.ean ?? "—"}</p>
            <p className="mt-1 truncate">{row.supplier_name ?? "Brak dostawcy"}</p>
            <Link to={`/products/${row.product_id}`} className="mt-2 inline-block font-medium text-blue-600 hover:underline">
              Karta produktu →
            </Link>
          </div>
        </div>

        <section className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Rekomendacja zakupu</h3>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-950">
            {formatQty(unit, row.suggested_qty)} <span className="text-sm font-normal text-emerald-800">szt.</span>
          </p>
          <p className="mt-1 text-xs text-emerald-900">
            Wartość szac.: {numFmt(row.estimated_order_value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
            {row.stock_cover_days != null ? ` · Zapas ~${numFmt(row.stock_cover_days, { maximumFractionDigits: 1 })} d` : ""}
          </p>
          {segment?.suggested_strategy ? (
            <p className="mt-2 text-xs text-emerald-950">{segment.suggested_strategy}</p>
          ) : null}
        </section>

        {segment ? (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Segment ABC/XYZ</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">{segment.segment}</span>
              <span className="text-xs text-slate-600">
                {segment.abc_class}/{segment.xyz_class} · priorytet {segment.reorder_priority}
              </span>
            </div>
          </section>
        ) : null}

        {alerts.length > 0 ? (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Alerty produktu</h3>
            <ul className="mt-2 space-y-2">
              {alerts.slice(0, 5).map((a) => (
                <li key={a.id} className={`rounded-lg px-3 py-2 text-xs ring-1 ${severityClass(a.severity)}`}>
                  <p className="font-medium">{a.title}</p>
                  {a.message ? <p className="mt-0.5 opacity-90">{a.message}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prognoza i sprzedaż</h3>
          {loading ? (
            <p className="mt-2 text-xs text-slate-500">Ładowanie…</p>
          ) : detail ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs">
              <dt className="text-slate-500">Śr. dzienna</dt>
              <dd className="text-right tabular-nums">{formatQty(unit, detail.avg_daily)}</dd>
              <dt className="text-slate-500">Prognoza 30 dni</dt>
              <dd className="text-right font-medium tabular-nums text-teal-800">{formatQty(unit, detail.forecast_30d)}</dd>
              <dt className="text-slate-500">Sprzedaż 7 / 30 / 90 d</dt>
              <dd className="text-right tabular-nums">
                {formatQty(unit, detail.sales_7d)} / {formatQty(unit, detail.sales_30d)} / {formatQty(unit, detail.sales_90d)}
              </dd>
              {detail.trend_percent != null ? (
                <>
                  <dt className="text-slate-500">Trend</dt>
                  <dd className="text-right tabular-nums">{numFmt(detail.trend_percent, { maximumFractionDigits: 1 })}%</dd>
                </>
              ) : null}
            </dl>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Brak danych prognozy.</p>
          )}
          {trend.length > 0 ? (
            <div className="mt-3 h-[140px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={36} />
                  <Tooltip labelFormatter={(l) => fmtShortDate(String(l))} formatter={(v: number) => [v, "Ilość"]} />
                  <Line type="monotone" dataKey="qty" stroke="#0f766e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </section>
      </div>
    </aside>
  );
}

export const PlanProductDetailPanel = memo(PlanProductDetailPanelInner);
