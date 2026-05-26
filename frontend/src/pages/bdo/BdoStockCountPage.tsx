import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import {
  createBdoStockCount,
  fetchBdoLedgerPreview,
  listBdoCatalog,
  listBdoStockCounts,
  type BdoStockCount,
  type BdoWmCatalogRow,
} from "../../api/bdoPackagingApi";
import { useWarehouse } from "../../context/WarehouseContext";

type Tenant = { id: number; name: string };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BdoStockCountPage() {
  const { selectedWarehouseId } = useWarehouse();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [materials, setMaterials] = useState<BdoWmCatalogRow[]>([]);
  const [ledger, setLedger] = useState<Record<string, number>>({});
  const [counts, setCounts] = useState<BdoStockCount[]>([]);
  const [countDate, setCountDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [byUser, setByUser] = useState("");
  const [lines, setLines] = useState<Record<string, { counted: string; notes: string }>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);

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

  const loadMaterials = useCallback(async () => {
    if (selectedWarehouseId == null) {
      setMaterials([]);
      setLines({});
      return;
    }
    const m = await listBdoCatalog(tenantId, selectedWarehouseId, { include_in_bdo_only: true, active_only: true });
    setMaterials(m);
    const init: Record<string, { counted: string; notes: string }> = {};
    m.forEach((mat) => {
      init[mat.wm_ref] = { counted: "", notes: "" };
    });
    setLines(init);
  }, [tenantId, selectedWarehouseId]);

  const loadLedger = useCallback(async () => {
    if (selectedWarehouseId == null) {
      setLedger({});
      return;
    }
    try {
      const L = await fetchBdoLedgerPreview(tenantId, selectedWarehouseId, countDate);
      setLedger(L);
    } catch {
      setLedger({});
    }
  }, [tenantId, selectedWarehouseId, countDate]);

  const loadCounts = useCallback(async () => {
    setCounts(await listBdoStockCounts(tenantId));
  }, [tenantId]);

  useEffect(() => {
    if (selectedWarehouseId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        await Promise.all([loadMaterials(), loadCounts(), loadLedger()]);
      } catch {
        setErr("Błąd wczytywania.");
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId, selectedWarehouseId, loadMaterials, loadCounts, loadLedger]);

  useEffect(() => {
    if (selectedWarehouseId == null) return;
    void loadLedger();
  }, [countDate, loadLedger, selectedWarehouseId]);

  useEffect(() => {
    if (!toastText) return;
    const t = window.setTimeout(() => setToastText(null), 4500);
    return () => window.clearTimeout(t);
  }, [toastText]);

  const saveCount = async () => {
    if (selectedWarehouseId == null) return;
    const payloadLines = materials
      .map((m) => {
        const li = lines[m.wm_ref];
        if (!li || li.counted.trim() === "") return null;
        const c = Number(li.counted);
        if (!Number.isFinite(c)) return null;
        return { wm_ref: m.wm_ref, counted_stock: c, notes: li.notes || null };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
    if (payloadLines.length === 0) {
      window.alert("Uzupełnij policzone ilości dla co najmniej jednego materiału.");
      return;
    }
    try {
      await createBdoStockCount({
        tenant_id: tenantId,
        count_date: countDate,
        notes: notes || null,
        created_by_label: byUser || null,
        lines: payloadLines,
      });
      setNotes("");
      setByUser("");
      await loadCounts();
      await loadLedger();
      await loadMaterials();
      setToastText("Spis zapisany. Stan końcowy posłuży do raportu miesięcznego.");
    } catch {
      window.alert("Zapis spisu nie powiódł się.");
    }
  };

  return (
    <div className="space-y-8">
      {toastText ? (
        <div
          className="fixed bottom-6 left-1/2 z-[400] max-w-md -translate-x-1/2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-center text-sm text-white shadow-lg"
          role="status"
        >
          {toastText}
        </div>
      ) : null}

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

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="text-slate-500">Ładowanie…</p> : null}

      {selectedWarehouseId != null && (
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Nowy spis</h2>
          <div className="mt-4 flex flex-wrap gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500">Data spisu</label>
              <input
                type="date"
                className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={countDate}
                onChange={(e) => setCountDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Osoba (opcj.)</label>
              <input
                className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={byUser}
                onChange={(e) => setByUser(e.target.value)}
                placeholder="Imię i nazwisko"
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="text-xs font-semibold text-slate-500">Uwagi do spisu</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Materiał</th>
                  <th className="px-3 py-3 text-right">Stan z księgi</th>
                  <th className="px-3 py-3 text-right">Stan policzony</th>
                  <th className="px-3 py-3 text-right">Różnica</th>
                  <th className="px-3 py-3">Uwagi pozycji</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => {
                  const sys = ledger[m.wm_ref] ?? 0;
                  const li = lines[m.wm_ref] ?? { counted: "", notes: "" };
                  const c = li.counted.trim() === "" ? NaN : Number(li.counted);
                  const diff = Number.isFinite(c) ? c - sys : NaN;
                  return (
                    <tr key={m.wm_ref} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-900">{m.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{sys.toLocaleString("pl-PL")}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          className="w-28 rounded border border-slate-200 px-2 py-1 text-right text-sm"
                          value={li.counted}
                          onChange={(e) =>
                            setLines((prev) => ({
                              ...prev,
                              [m.wm_ref]: { ...li, counted: e.target.value },
                            }))
                          }
                          placeholder="—"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {Number.isFinite(diff) ? diff.toLocaleString("pl-PL") : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-full min-w-[120px] rounded border border-slate-200 px-2 py-1 text-sm"
                          value={li.notes}
                          onChange={(e) =>
                            setLines((prev) => ({
                              ...prev,
                              [m.wm_ref]: { ...li, notes: e.target.value },
                            }))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => void saveCount()}
            className="mt-5 inline-flex rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
          >
            Zapisz spis
          </button>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Historia spisów</h2>
        <div className="space-y-4">
          {counts.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="font-semibold text-slate-900">
                {s.count_date} {s.period_label ? `· ${s.period_label}` : ""}
              </p>
              <p className="text-xs text-slate-500">
                {s.created_by_label ? `Osoba: ${s.created_by_label}` : ""} {s.notes ? `· ${s.notes}` : ""}
              </p>
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1">Materiał</th>
                    <th className="py-1 text-right">Księga</th>
                    <th className="py-1 text-right">Policzono</th>
                    <th className="py-1 text-right">Różnica</th>
                  </tr>
                </thead>
                <tbody>
                  {s.lines.map((ln) => (
                    <tr key={`${s.id}-${ln.wm_ref}`} className="border-t border-slate-100">
                      <td className="py-1">{ln.material_name}</td>
                      <td className="py-1 text-right tabular-nums">{ln.system_stock}</td>
                      <td className="py-1 text-right tabular-nums">{ln.counted_stock}</td>
                      <td className="py-1 text-right tabular-nums">{ln.difference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
