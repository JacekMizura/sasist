import { useCallback, useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { createBdoPurchase, listBdoCatalog, listBdoPurchases, type BdoPurchase, type BdoWmCatalogRow } from "../../api/bdoPackagingApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { AppButton, AppCard, AppEmptyState, AppSection } from "../../components/app-shell";
import {
  PurchasingFilterField,
  PurchasingInfoNotice,
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingInputClass,
  purchasingSelectClass,
  purchasingTableTdClass,
} from "../../modules/purchasing/ui";
import { BdoFilterBar } from "./components/BdoFilterBar";
import { useBdoTenant } from "./hooks/useBdoTenant";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BdoPurchasesPage() {
  const { selectedWarehouseId } = useWarehouse();
  const { tenants, tenantId, setTenantId } = useBdoTenant();
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
    <div className="space-y-5 pb-8">
      <BdoFilterBar tenants={tenants} tenantId={tenantId} onTenantChange={setTenantId} />

      <PurchasingInfoNotice tone="slate">
        Ręczne wpisy zakupów dla materiałów z asortymentu (włączonych do BDO). Po zapisie zwiększa się szacowany stan z
        księgi zakupów + korekt.
      </PurchasingInfoNotice>

      {selectedWarehouseId == null ? (
        <PurchasingInfoNotice tone="amber">
          Wybierz magazyn w nagłówku aplikacji — lista materiałów jest per magazyn.
        </PurchasingInfoNotice>
      ) : null}

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div className="max-w-5xl">
        <AppCard>
          <AppSection title="Dodaj zakup">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <PurchasingFilterField label="Materiał">
                <select
                  className={purchasingSelectClass}
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
              </PurchasingFilterField>
              <PurchasingFilterField label="Data">
                <input
                  type="date"
                  className={purchasingInputClass}
                  value={form.purchase_date}
                  onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))}
                />
              </PurchasingFilterField>
              <PurchasingFilterField label="Dostawca">
                <input
                  className={purchasingInputClass}
                  value={form.supplier_name}
                  onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))}
                />
              </PurchasingFilterField>
              <PurchasingFilterField label="Ilość">
                <input
                  type="number"
                  step="0.01"
                  className={purchasingInputClass}
                  value={form.qty}
                  onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) }))}
                />
              </PurchasingFilterField>
              <PurchasingFilterField label="Koszt jednostkowy (opcj.)">
                <input
                  type="number"
                  step="0.01"
                  className={purchasingInputClass}
                  value={form.unit_cost}
                  onChange={(e) => setForm((f) => ({ ...f, unit_cost: e.target.value }))}
                />
              </PurchasingFilterField>
              <PurchasingFilterField label="Wartość łącznie (opcj.)">
                <input
                  type="number"
                  step="0.01"
                  className={purchasingInputClass}
                  value={form.total}
                  onChange={(e) => setForm((f) => ({ ...f, total: e.target.value }))}
                />
              </PurchasingFilterField>
              <PurchasingFilterField label="Nr dokumentu" className="sm:col-span-2">
                <input
                  className={purchasingInputClass}
                  value={form.document_no}
                  onChange={(e) => setForm((f) => ({ ...f, document_no: e.target.value }))}
                />
              </PurchasingFilterField>
              <PurchasingFilterField label="Uwagi" className="sm:col-span-2">
                <input
                  className={purchasingInputClass}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </PurchasingFilterField>
            </div>
            <div className="mt-4">
              <AppButton variant="primary" onClick={() => void addPurchase()}>
                Zapisz zakup
              </AppButton>
            </div>
          </AppSection>
        </AppCard>
      </div>

      {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}

      {!loading && rows.length === 0 ? (
        <AppEmptyState
          icon={ShoppingCart}
          title="Brak zarejestrowanych zakupów"
          description="Zapisane zakupy materiałów BDO pojawią się w tabeli poniżej."
        />
      ) : null}

      {rows.length > 0 ? (
        <PurchasingTableSection title="Historia zakupów BDO">
          <table className="w-full min-w-[720px] text-sm">
            <PurchasingTableHeader
              headers={["Data", "Dostawca", "Materiał", "Ilość", "Koszt j.", "Wartość", "Dokument"]}
              align={["left", "left", "left", "right", "right", "right", "left"]}
            />
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                  <td className={`${purchasingTableTdClass} tabular-nums`}>{r.purchase_date}</td>
                  <td className={purchasingTableTdClass}>{r.supplier_name || "—"}</td>
                  <td className={purchasingTableTdClass}>{r.material_name}</td>
                  <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{r.qty}</td>
                  <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{r.unit_cost ?? "—"}</td>
                  <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{r.total ?? "—"}</td>
                  <td className={purchasingTableTdClass}>{r.document_no ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PurchasingTableSection>
      ) : null}
    </div>
  );
}
