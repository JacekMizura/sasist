import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { fetchBdoDashboard, fetchBdoRecent, type BdoAudit, type BdoDashboard } from "../../api/bdoPackagingApi";
import { useWarehouse } from "../../context/WarehouseContext";

type Tenant = { id: number; name: string };

function fmt(n: number, maxFrac = 2): string {
  return n.toLocaleString("pl-PL", { maximumFractionDigits: maxFrac });
}

function fmtMoney(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BdoDashboardPage() {
  const { selectedWarehouseId } = useWarehouse();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [dash, setDash] = useState<BdoDashboard | null>(null);
  const [recent, setRecent] = useState<BdoAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        const tid = searchParams.get("tenant_id");
        if (tid != null && tid !== "") {
          const n = Number(tid);
          if (Number.isFinite(n) && n >= 1) setTenantId(n);
        }
      })
      .catch(() => setTenants([]));
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [d, r] = await Promise.all([
        fetchBdoDashboard(tenantId, selectedWarehouseId ?? undefined),
        fetchBdoRecent(tenantId, 40),
      ]);
      setDash(d);
      setRecent(r);
    } catch {
      setErr("Nie udało się wczytać pulpitu BDO.");
      setDash(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedWarehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Podmiot</span>
          <select
            value={tenantId}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTenantId(v);
              setSearchParams({ tenant_id: String(v) }, { replace: true });
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="text-slate-500">Ładowanie…</p> : null}

      {dash && !loading ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Materiały w ewidencji</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{dash.materials_tracked}</p>
              <p className="mt-1 text-xs text-slate-500">Pozycje z asortymentu, włączone do BDO</p>
            </div>
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Szac. tworzywo (stan)</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{fmt(dash.estimated_plastic_kg, 3)} kg</p>
              <p className="mt-1 text-xs text-slate-500">Stan magazynowy × kg jednostki</p>
              <p className="mt-1 text-[11px] text-slate-400">Księga (szac.): {fmt(dash.ledger_plastic_kg, 3)} kg</p>
            </div>
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Szac. papier / tektura (stan)</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{fmt(dash.estimated_paper_kg, 3)} kg</p>
              <p className="mt-1 text-xs text-slate-500">Stan magazynowy × kg jednostki</p>
              <p className="mt-1 text-[11px] text-slate-400">Księga (szac.): {fmt(dash.ledger_paper_kg, 3)} kg</p>
            </div>
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Zakupy w bieżącym miesiącu</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{fmtMoney(dash.month_purchases_pln)}</p>
              <p className="mt-1 text-xs text-slate-500">Suma wartości (PLN) lub ilość × cena</p>
            </div>
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ostatni raport (spis)</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{dash.last_report_month_label ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-amber-200/90 bg-amber-50/80 p-5 shadow-sm ring-1 ring-amber-200/80">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Alerty: brak spisu</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-amber-950">{dash.missing_stock_counts}</p>
              <p className="mt-1 text-xs text-amber-900/90">Materiały bez spisu ponad 90 dni</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-200/80">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Ostatnie działania</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Czynność</th>
                    <th className="px-4 py-3">Szczegóły</th>
                    <th className="px-4 py-3">Użytkownik</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        Brak wpisów.
                      </td>
                    </tr>
                  ) : (
                    recent.map((a) => (
                      <tr key={a.id} className="border-t border-slate-100">
                        <td className="px-4 py-2.5 tabular-nums text-slate-700">
                          {a.created_at
                            ? new Date(a.created_at).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{a.action}</td>
                        <td className="max-w-md truncate px-4 py-2.5 text-slate-600">{a.detail ?? "—"}</td>
                        <td className="px-4 py-2.5 text-slate-600">{a.user_label ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
