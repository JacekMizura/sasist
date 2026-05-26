import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import {
  createBdoCorrection,
  listBdoCatalog,
  listBdoCorrections,
  type BdoCorrection,
  type BdoCorrectionReason,
  type BdoWmCatalogRow,
} from "../../api/bdoPackagingApi";
import { useWarehouse } from "../../context/WarehouseContext";

type Tenant = { id: number; name: string };

const REASONS: { id: BdoCorrectionReason; label: string }[] = [
  { id: "damage", label: "Uszkodzenie" },
  { id: "disposal", label: "Utylizacja" },
  { id: "returned_supplier", label: "Zwrot do dostawcy" },
  { id: "internal_usage", label: "Zużycie wewnętrzne" },
  { id: "opening_balance", label: "Stan otwarcia" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BdoCorrectionsPage() {
  const { selectedWarehouseId } = useWarehouse();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [materials, setMaterials] = useState<BdoWmCatalogRow[]>([]);
  const [rows, setRows] = useState<BdoCorrection[]>([]);
  const [form, setForm] = useState({
    wm_ref: "",
    correction_date: todayIso(),
    qty: 0,
    reason: "damage" as BdoCorrectionReason,
    notes: "",
  });

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
    if (selectedWarehouseId == null) {
      setMaterials([]);
      setRows([]);
      return;
    }
    try {
      const [m, c] = await Promise.all([
        listBdoCatalog(tenantId, selectedWarehouseId, { include_in_bdo_only: true, active_only: true }),
        listBdoCorrections(tenantId),
      ]);
      setMaterials(m);
      setRows(c);
      if (m.length > 0) {
        setForm((f) => (f.wm_ref && m.some((x) => x.wm_ref === f.wm_ref) ? f : { ...f, wm_ref: m[0].wm_ref }));
      } else {
        setForm((f) => ({ ...f, wm_ref: "" }));
      }
    } catch {
      setMaterials([]);
      setRows([]);
    }
  }, [tenantId, selectedWarehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form.wm_ref) return;
    try {
      await createBdoCorrection({
        tenant_id: tenantId,
        wm_ref: form.wm_ref,
        correction_date: form.correction_date,
        qty: Number(form.qty),
        reason: form.reason,
        notes: form.notes || null,
      });
      setForm((f) => ({ ...f, qty: 0, notes: "" }));
      void load();
    } catch {
      window.alert("Zapis korekty nie powiódł się.");
    }
  };

  const reasonLabel = (r: string) => REASONS.find((x) => x.id === r)?.label ?? r;

  return (
    <div className="space-y-8">
      {selectedWarehouseId == null ? (
        <p className="text-sm text-amber-800">Wybierz magazyn w nagłówku aplikacji.</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
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

      <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Nowa korekta</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-semibold text-slate-500">Materiał</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.wm_ref}
              onChange={(e) => setForm((f) => ({ ...f, wm_ref: e.target.value }))}
              disabled={materials.length === 0}
            >
              {materials.length === 0 ? (
                <option value="">Brak materiałów BDO</option>
              ) : (
                materials.map((m) => (
                  <option key={m.wm_ref} value={m.wm_ref}>
                    {m.kind === "carton" ? "[Karton] " : ""}
                    {m.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Data</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.correction_date}
              onChange={(e) => setForm((f) => ({ ...f, correction_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Ilość (+ / −)</label>
            <input
              type="number"
              step="0.01"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Powód</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value as BdoCorrectionReason }))}
            >
              {REASONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="text-xs font-semibold text-slate-500">Uwagi</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          className="mt-4 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          Zapisz korektę
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Data</th>
              <th className="px-3 py-3">Materiał</th>
              <th className="px-3 py-3 text-right">Ilość</th>
              <th className="px-3 py-3">Powód</th>
              <th className="px-3 py-3">Uwagi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2.5">{r.correction_date}</td>
                <td className="px-3 py-2.5">{r.material_name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium">{r.qty.toLocaleString("pl-PL")}</td>
                <td className="px-3 py-2.5">{reasonLabel(r.reason)}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
