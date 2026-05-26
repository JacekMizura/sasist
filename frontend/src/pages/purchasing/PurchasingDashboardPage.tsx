import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchPurchasingDashboard,
  type PurchasingDashboardPayload,
} from "../../api/purchasingDashboardApi";
import api from "../../api/axios";
import { useWarehouse } from "../../context/WarehouseContext";

type Tenant = { id: number; name: string };

const DELIVERY_STATUS_PL: Record<string, string> = {
  draft: "Szkic",
  ordered: "Zamówione",
  in_transit: "W drodze",
  received: "Dostarczone",
  cancelled: "Anulowane",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function KpiCard({
  title,
  value,
  hint,
  tone = "slate",
}: {
  title: string;
  value: string | number;
  hint?: string;
  tone?: "slate" | "amber" | "rose" | "emerald" | "violet";
}) {
  const ring =
    tone === "rose"
      ? "ring-rose-200/80"
      : tone === "amber"
        ? "ring-amber-200/80"
        : tone === "emerald"
          ? "ring-emerald-200/80"
          : tone === "violet"
            ? "ring-violet-200/80"
            : "ring-slate-200/90";
  return (
    <div className={`rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ${ring}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function PurchasingDashboardPage() {
  const { selectedWarehouseId } = useWarehouse();
  const [searchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [data, setData] = useState<PurchasingDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        if (list.length > 0 && !list.some((t) => t.id === tenantId)) setTenantId(list[0].id);
      })
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    const tid = searchParams.get("tenant_id");
    if (tid != null && tid !== "") {
      const n = Number(tid);
      if (Number.isFinite(n) && n >= 1) setTenantId(n);
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const payload = await fetchPurchasingDashboard({
        tenant_id: tenantId,
        warehouse_id: selectedWarehouseId,
      });
      setData(payload);
    } catch {
      setErr("Nie udało się wczytać pulpitu zakupów.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedWarehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const th = "py-3 px-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
  const td = "py-3 px-3 text-sm text-slate-800";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-slate-600">Podmiot</label>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
            value={tenantId}
            onChange={(e) => setTenantId(Number(e.target.value))}
          >
            {tenants.length === 0 ? (
              <option value={tenantId}>#{tenantId}</option>
            ) : (
              tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Odśwież
          </button>
        </div>
      </div>

      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie danych…</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              title="Produkty krytyczne"
              value={data.kpis.critical_products}
              hint="Stan ≤ 0 lub poniżej progu min. stanu"
              tone="rose"
            />
            <KpiCard
              title="Braki w 7 dni"
              value={data.kpis.out_of_stock_in_7_days}
              hint="Przy obecnym zużyciu: pokrycie 1–7 dni"
              tone="amber"
            />
            <KpiCard
              title="Sugestie zamówień"
              value={data.kpis.suggested_orders_count}
              hint="Liczba pozycji z sugerowaną ilością ≥ 1"
            />
            <KpiCard
              title="Wartość sugerowanych zakupów"
              value={`${data.kpis.suggested_purchase_value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              hint="Σ sugerowana ilość × cena zakupu"
              tone="violet"
            />
            <KpiCard title="Dostawcy aktywni" value={data.kpis.active_suppliers} tone="emerald" />
            <KpiCard
              title="Dostawy w drodze / otwarte"
              value={data.kpis.deliveries_in_pipeline}
              hint="Statusy: szkic, zamówione, w drodze"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SectionCard title="Krytyczne produkty (top 10)">
              {data.critical_products.length === 0 ? (
                <p className="text-sm text-slate-500">Brak pozycji spełniających kryterium.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px]">
                    <thead className="border-b border-slate-200">
                      <tr>
                        <th className={th}>Produkt</th>
                        <th className={`${th} text-right`}>Stan</th>
                        <th className={`${th} text-right`}>Śr. / dzień</th>
                        <th className={`${th} text-right`}>Dni</th>
                        <th className={th}>Dostawca</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.critical_products.map((r) => (
                        <tr key={r.product_id} className="border-b border-slate-100 last:border-0">
                          <td className={td}>
                            <span className="font-medium text-slate-900">{r.product_name}</span>
                            {r.sku ? <span className="mt-0.5 block text-xs text-slate-500">{r.sku}</span> : null}
                          </td>
                          <td className={`${td} text-right tabular-nums`}>{r.stock}</td>
                          <td className={`${td} text-right tabular-nums`}>{r.avg_daily_sales.toFixed(4)}</td>
                          <td className={`${td} text-right tabular-nums`}>
                            {r.days_cover != null ? r.days_cover : "—"}
                          </td>
                          <td className={`${td} text-slate-600`}>{r.supplier_name ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Największe sugestie zakupowe (top 10)">
              {data.suggested_orders.length === 0 ? (
                <p className="text-sm text-slate-500">Brak sugestii przy obecnych danych (sprzedaż / stany).</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px]">
                    <thead className="border-b border-slate-200">
                      <tr>
                        <th className={th}>Produkt</th>
                        <th className={`${th} text-right`}>Sugerowana ilość</th>
                        <th className={th}>Dostawca</th>
                        <th className={`${th} text-right`}>Szac. koszt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.suggested_orders.map((r) => (
                        <tr key={r.product_id} className="border-b border-slate-100 last:border-0">
                          <td className={td}>
                            <span className="font-medium text-slate-900">{r.product_name}</span>
                          </td>
                          <td className={`${td} text-right tabular-nums`}>{r.suggested_qty}</td>
                          <td className={`${td} text-slate-600`}>{r.supplier_name ?? "—"}</td>
                          <td className={`${td} text-right tabular-nums font-medium`}>
                            {r.estimated_cost.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Ostatnie dostawy / zamówienia do dostawcy">
            {data.recent_orders.length === 0 ? (
              <p className="text-sm text-slate-500">Brak dokumentów dostaw w bazie.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <thead className="border-b border-slate-200">
                    <tr>
                      <th className={th}>Numer / nazwa</th>
                      <th className={th}>Dostawca</th>
                      <th className={th}>Status</th>
                      <th className={th}>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_orders.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 last:border-0">
                        <td className={`${td} font-medium`}>{r.document_no}</td>
                        <td className={td}>{r.supplier_name}</td>
                        <td className={td}>
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                            {DELIVERY_STATUS_PL[r.status] ?? r.status}
                          </span>
                        </td>
                        <td className={`${td} text-slate-600`}>{formatDate(r.created_at ?? undefined)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
