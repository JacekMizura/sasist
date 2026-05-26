import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { createBdoPurchase, listBdoCatalog, listBdoPurchases, type BdoPurchase, type BdoWmCatalogRow } from "../../api/bdoPackagingApi";
import { useWarehouse } from "../../context/WarehouseContext";

type Tenant = { id: number; name: string };

function todayIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function BdoPurchasesPage() {
  const { selectedWarehouseId } = useWarehouse();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [materials, setMaterials] = useState<BdoWmCatalogRow[]>([]);
  const [rows, setRows] = useState<BdoPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    wm_ref: "",
    purchase_date: todayIso(),
    supplier_name: "",
    qty: 1,
    unit_cost: "" as string | number,
    total: "" as string | number | "",
    document_no: "",
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
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const [m, p] = await Promise.all([
        listBdoCatalog(tenantId, selectedWarehouseId, { include_in_bdo_only: true, active_only: true }),
        listBdoPurchases(tenantId),
      ]);
      setMaterials(m);
      setRows(p);
      if (m.length > 0) {
        setForm((f) => (f.wm_ref && m.some((x) => x.wm_ref === f.wm_ref) ? f : { ...f, wm_ref: m[0].wm_ref }));
      } else {
        setForm((f) => ({ ...f, wm_ref: "" }));
      }
    } catch {
      setErr("Nie udało się wczytać zakupów.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedWarehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadPurchases = useCallback(async () => {
    try {
      setRows(await listBdoPurchases(tenantId));
    } catch {
      /* ignore */
    }
  }, [tenantId]);

  const addPurchase = async () => {
    if (!form.wm_ref) {
      window.alert("Wybierz materiał (włącz go do BDO w zakładce Materiały, jeśli brak na liście).");
      return;
    }
    const qty = Number(form.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      window.alert("Podaj dodatnią ilość.");
      return;
    }
    const uc = form.unit_cost === "" ? null : Number(form.unit_cost);
    const tot = form.total === "" ? null : Number(form.total);
    try {
      await createBdoPurchase({
        tenant_id: tenantId,
        wm_ref: form.wm_ref,
        purchase_date: form.purchase_date,
        supplier_name: form.supplier_name,
        qty,
        unit_cost: uc != null && Number.isFinite(uc) ? uc : null,
        total: tot != null && Number.isFinite(tot) ? tot : null,
        document_no: form.document_no || null,
        notes: form.notes || null,
      });
      setForm((f) => ({
        ...f,
        qty: 1,
        unit_cost: "",
        total: "",
        document_no: "",
        notes: "",
      }));
      void reloadPurchases();
    } catch {
      window.alert("Zapis zakupu nie powiódł się.");
    }
  };

  return (
    <div className="space-y-8">
      <p className="text-sm text-slate-600">
        Ręczne wpisy zakupów dla materiałów z asortymentu (włączonych do BDO). Po zapisie zwiększa się szacowany stan z
        księgi zakupów + korekt.
      </p>

      {selectedWarehouseId == null ? (
        <p className="text-sm text-amber-800">Wybierz magazyn w nagłówku aplikacji — lista materiałów jest per magazyn.</p>
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

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-5 shadow-sm ring-1 ring-slate-200/60">
        <h2 className="text-base font-semibold text-slate-900">Dodaj zakup</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Materiał</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.wm_ref}
              onChange={(e) => setForm((f) => ({ ...f, wm_ref: e.target.value }))}
              disabled={materials.length === 0}
            >
              {materials.length === 0 ? (
                <option value="">Brak materiałów BDO w tym magazynie</option>
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
              value={form.purchase_date}
              onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Dostawca</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.supplier_name}
              onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Ilość</label>
            <input
              type="number"
              step="0.01"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Koszt jednostkowy (opcj.)</label>
            <input
              type="number"
              step="0.01"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.unit_cost}
              onChange={(e) => setForm((f) => ({ ...f, unit_cost: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Wartość łącznie (opcj.)</label>
            <input
              type="number"
              step="0.01"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.total}
              onChange={(e) => setForm((f) => ({ ...f, total: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-500">Nr dokumentu</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.document_no}
              onChange={(e) => setForm((f) => ({ ...f, document_no: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
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
          onClick={() => void addPurchase()}
          className="mt-5 inline-flex rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
        >
          Zapisz zakup
        </button>
      </div>

      {loading ? <p className="text-slate-500">Ładowanie…</p> : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Data</th>
              <th className="px-3 py-3">Dostawca</th>
              <th className="px-3 py-3">Materiał</th>
              <th className="px-3 py-3 text-right">Ilość</th>
              <th className="px-3 py-3 text-right">Koszt j.</th>
              <th className="px-3 py-3 text-right">Wartość</th>
              <th className="px-3 py-3">Dokument</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2.5 tabular-nums">{r.purchase_date}</td>
                <td className="px-3 py-2.5">{r.supplier_name || "—"}</td>
                <td className="px-3 py-2.5">{r.material_name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.qty}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.unit_cost ?? "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.total ?? "—"}</td>
                <td className="px-3 py-2.5">{r.document_no ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
