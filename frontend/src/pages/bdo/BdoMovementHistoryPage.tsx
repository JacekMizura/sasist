import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { listBdoMovements, type BdoMovement } from "../../api/bdoPackagingApi";
import { useWarehouse } from "../../context/WarehouseContext";

type Tenant = { id: number; name: string };

function typeLabel(t: string): string {
  switch (t) {
    case "purchase":
      return "Zakup (BDO)";
    case "correction":
      return "Korekta";
    case "stock_count":
      return "Spis z natury";
    default:
      return t;
  }
}

export default function BdoMovementHistoryPage() {
  const { selectedWarehouseId } = useWarehouse();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [rows, setRows] = useState<BdoMovement[]>([]);
  const [filterType, setFilterType] = useState<string>("");
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
      setRows(
        await listBdoMovements(tenantId, {
          warehouseId: selectedWarehouseId ?? undefined,
          movementType: filterType || undefined,
          limit: 800,
        }),
      );
    } catch {
      setErr("Nie udało się wczytać historii ruchów.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedWarehouseId, filterType]);

  useEffect(() => {
    void load();
  }, [load]);

  const fmtMoney = useMemo(
    () => (n: number | null | undefined) =>
      n == null || !Number.isFinite(n)
        ? "—"
        : new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(n),
    [],
  );

  const fmtDt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Zbiorcza historia operacji BDO: ręczne zakupy materiałów, korekty stanu oraz spisy z natury. Dane pochodzą z
        ewidencji BDO (nie duplikują modułu zamówień).{" "}
        <Link to="/warehouse/bdo/purchases" className="font-semibold text-violet-700 underline">
          Rejestracja pojedynczego zakupu (BDO)
        </Link>
      </p>

      {selectedWarehouseId == null ? (
        <p className="text-sm text-amber-800">Wybierz magazyn w nagłówku — lista zostanie odfiltrowana do tego magazynu.</p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
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
        <div>
          <label className="text-xs font-semibold text-slate-500">Typ</label>
          <select
            className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">Wszystkie</option>
            <option value="purchase">Zakupy (BDO)</option>
            <option value="correction">Korekty</option>
            <option value="stock_count">Spisy</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
        >
          Odśwież
        </button>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="text-slate-500">Ładowanie…</p> : null}

      {!loading && rows.length === 0 ? <p className="text-sm text-slate-600">Brak zdarzeń dla wybranych filtrów.</p> : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Data</th>
                <th className="px-3 py-3">Typ</th>
                <th className="px-3 py-3">Materiał / opis</th>
                <th className="px-3 py-3">wm_ref</th>
                <th className="px-3 py-3 text-right">Ilość</th>
                <th className="px-3 py-3 text-right">Kwota</th>
                <th className="px-3 py-3">Ref / uwagi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 tabular-nums text-slate-700">{fmtDt(r.occurred_at)}</td>
                  <td className="px-3 py-2 text-slate-800">{typeLabel(r.movement_type)}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{r.material_name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.wm_ref ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                    {r.qty != null && Number.isFinite(r.qty) ? r.qty.toLocaleString("pl-PL", { maximumFractionDigits: 3 }) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">{fmtMoney(r.amount_pln)}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-slate-600" title={r.notes ?? r.reference ?? ""}>
                    {r.reference ? <span className="font-medium">{r.reference}</span> : null}
                    {r.reference && r.notes ? " · " : null}
                    {r.notes ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
