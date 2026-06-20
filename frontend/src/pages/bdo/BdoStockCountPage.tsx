import { useCallback, useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import {
  createBdoStockCount,
  fetchBdoLedgerPreview,
  listBdoCatalog,
  listBdoStockCounts,
  type BdoStockCount,
  type BdoWmCatalogRow,
} from "../../api/bdoPackagingApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { AppButton, AppCard, AppEmptyState, AppSection } from "../../components/app-shell";
import {
  PurchasingFilterField,
  PurchasingInfoNotice,
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingInputClass,
  purchasingTableTdClass,
} from "../../modules/purchasing/ui";
import { BdoFilterBar } from "./components/BdoFilterBar";
import { useBdoTenant } from "./hooks/useBdoTenant";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BdoStockCountPage() {
  const { selectedWarehouseId } = useWarehouse();
  const { tenants, tenantId, setTenantId } = useBdoTenant();
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
    <div className="space-y-5 pb-8">
      {toastText ? (
        <div
          className="fixed bottom-6 left-1/2 z-[400] max-w-md -translate-x-1/2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-center text-sm text-white shadow-lg"
          role="status"
        >
          {toastText}
        </div>
      ) : null}

      <BdoFilterBar tenants={tenants} tenantId={tenantId} onTenantChange={setTenantId} />

      {selectedWarehouseId == null ? (
        <PurchasingInfoNotice tone="amber">Wybierz magazyn w nagłówku aplikacji.</PurchasingInfoNotice>
      ) : null}

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}

      {selectedWarehouseId != null && !loading ? (
        <div className="max-w-6xl space-y-5">
          <AppCard>
            <AppSection title="Nowy spis">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <PurchasingFilterField label="Data spisu">
                  <input
                    type="date"
                    className={purchasingInputClass}
                    value={countDate}
                    onChange={(e) => setCountDate(e.target.value)}
                  />
                </PurchasingFilterField>
                <PurchasingFilterField label="Osoba (opcj.)">
                  <input
                    className={purchasingInputClass}
                    value={byUser}
                    onChange={(e) => setByUser(e.target.value)}
                    placeholder="Imię i nazwisko"
                  />
                </PurchasingFilterField>
                <PurchasingFilterField label="Uwagi do spisu" className="sm:col-span-2 lg:col-span-1">
                  <input className={purchasingInputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </PurchasingFilterField>
              </div>

              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[640px] text-sm">
                  <PurchasingTableHeader
                    headers={["Materiał", "Stan z księgi", "Stan policzony", "Różnica", "Uwagi pozycji"]}
                    align={["left", "right", "right", "right", "left"]}
                  />
                  <tbody>
                    {materials.map((m) => {
                      const sys = ledger[m.wm_ref] ?? 0;
                      const li = lines[m.wm_ref] ?? { counted: "", notes: "" };
                      const c = li.counted.trim() === "" ? NaN : Number(li.counted);
                      const diff = Number.isFinite(c) ? c - sys : NaN;
                      return (
                        <tr key={m.wm_ref} className="border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                          <td className={`${purchasingTableTdClass} font-medium text-slate-900`}>{m.name}</td>
                          <td className={`${purchasingTableTdClass} text-right tabular-nums text-slate-600`}>
                            {sys.toLocaleString("pl-PL")}
                          </td>
                          <td className={purchasingTableTdClass}>
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
                          <td className={`${purchasingTableTdClass} text-right tabular-nums text-slate-700`}>
                            {Number.isFinite(diff) ? diff.toLocaleString("pl-PL") : "—"}
                          </td>
                          <td className={purchasingTableTdClass}>
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
              <div className="mt-4">
                <AppButton variant="primary" onClick={() => void saveCount()}>
                  Zapisz spis
                </AppButton>
              </div>
            </AppSection>
          </AppCard>
        </div>
      ) : null}

      {!loading && counts.length === 0 ? (
        <AppEmptyState
          icon={ClipboardList}
          title="Brak wykonanych spisów"
          description="Po zapisie spisu z natury historia pojawi się poniżej."
        />
      ) : null}

      {counts.length > 0 ? (
        <div className="space-y-4">
          {counts.map((s) => (
            <PurchasingTableSection
              key={s.id}
              title={`${s.count_date}${s.period_label ? ` · ${s.period_label}` : ""}`}
              subtitle={[s.created_by_label ? `Osoba: ${s.created_by_label}` : null, s.notes || null]
                .filter(Boolean)
                .join(" · ")}
            >
              <table className="w-full text-sm">
                <PurchasingTableHeader
                  headers={["Materiał", "Księga", "Policzono", "Różnica"]}
                  align={["left", "right", "right", "right"]}
                />
                <tbody>
                  {s.lines.map((ln) => (
                    <tr key={`${s.id}-${ln.wm_ref}`} className="border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                      <td className={purchasingTableTdClass}>{ln.material_name}</td>
                      <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{ln.system_stock}</td>
                      <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{ln.counted_stock}</td>
                      <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{ln.difference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PurchasingTableSection>
          ))}
        </div>
      ) : null}
    </div>
  );
}
