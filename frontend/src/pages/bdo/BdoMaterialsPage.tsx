import { useCallback, useEffect, useState } from "react";
import { Package, Pencil } from "lucide-react";
import { listBdoCatalog, patchBdoWmFields, type BdoWmCatalogRow } from "../../api/bdoPackagingApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { AppButton, AppCard, AppEmptyState } from "../../components/app-shell";
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

type BdoForm = {
  plastic_kg_per_unit: number;
  paper_kg_per_unit: number;
  wood_kg_per_unit: number;
  glass_kg_per_unit: number;
  metal_kg_per_unit: number;
  packaging_type: string;
  include_in_bdo: boolean;
};

function emptyBdoForm(): BdoForm {
  return {
    plastic_kg_per_unit: 0,
    paper_kg_per_unit: 0,
    wood_kg_per_unit: 0,
    glass_kg_per_unit: 0,
    metal_kg_per_unit: 0,
    packaging_type: "",
    include_in_bdo: false,
  };
}

export default function BdoMaterialsPage() {
  const { selectedWarehouseId } = useWarehouse();
  const { tenants, tenantId, setTenantId } = useBdoTenant();
  const [rows, setRows] = useState<BdoWmCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState<BdoWmCatalogRow | null>(null);
  const [form, setForm] = useState<BdoForm>(emptyBdoForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (selectedWarehouseId == null) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      setRows(await listBdoCatalog(tenantId, selectedWarehouseId, { include_in_bdo_only: false, active_only: false }));
    } catch {
      setErr("Nie udało się wczytać materiałów magazynowych.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedWarehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (m: BdoWmCatalogRow) => {
    setEditRow(m);
    setForm({
      plastic_kg_per_unit: m.plastic_kg_per_unit,
      paper_kg_per_unit: m.paper_kg_per_unit,
      wood_kg_per_unit: m.wood_kg_per_unit,
      glass_kg_per_unit: m.glass_kg_per_unit,
      metal_kg_per_unit: m.metal_kg_per_unit,
      packaging_type: m.packaging_type ?? "",
      include_in_bdo: m.include_in_bdo,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (editRow == null || selectedWarehouseId == null) return;
    setSaving(true);
    try {
      await patchBdoWmFields(tenantId, selectedWarehouseId, {
        wm_ref: editRow.wm_ref,
        plastic_kg_per_unit: form.plastic_kg_per_unit,
        paper_kg_per_unit: form.paper_kg_per_unit,
        wood_kg_per_unit: form.wood_kg_per_unit,
        glass_kg_per_unit: form.glass_kg_per_unit,
        metal_kg_per_unit: form.metal_kg_per_unit,
        packaging_type: form.packaging_type.trim() || null,
        include_in_bdo: form.include_in_bdo,
      });
      setModalOpen(false);
      void load();
    } catch {
      window.alert("Zapis nie powiódł się.");
    } finally {
      setSaving(false);
    }
  };

  const kindLabel = (k: string) => (k === "carton" ? "Karton" : "Materiał");

  return (
    <div className="space-y-5 pb-8">
      <BdoFilterBar tenants={tenants} tenantId={tenantId} onTenantChange={setTenantId} />

      {selectedWarehouseId == null ? (
        <PurchasingInfoNotice tone="amber">
          Wybierz magazyn w nagłówku aplikacji, aby wczytać materiały.
        </PurchasingInfoNotice>
      ) : null}

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}

      {!loading && selectedWarehouseId != null && rows.length === 0 ? (
        <AppEmptyState
          icon={Package}
          title="Brak materiałów BDO"
          description="Włącz materiały magazynowe do ewidencji BDO lub dodaj pozycje w asortymencie."
        />
      ) : null}

      {!loading && selectedWarehouseId != null && rows.length > 0 ? (
        <PurchasingTableSection title="Materiały magazynowe">
          <table className="w-full min-w-[1100px] text-sm">
            <PurchasingTableHeader
              headers={[
                "Typ",
                "Nazwa",
                "SKU",
                "Kategoria",
                "Jednostka",
                "Stan",
                "BDO",
                "Tworzywo kg/j.",
                "Papier kg/j.",
                "Drewno",
                "Szkło",
                "Metal",
                "",
              ]}
              align={[
                "left",
                "left",
                "left",
                "left",
                "left",
                "right",
                "left",
                "right",
                "right",
                "right",
                "right",
                "right",
                "left",
              ]}
            />
            <tbody>
              {rows.map((m) => (
                <tr key={m.wm_ref} className="border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                  <td className={`${purchasingTableTdClass} text-slate-600`}>{kindLabel(m.kind)}</td>
                  <td className={`${purchasingTableTdClass} font-medium text-slate-900`}>{m.name}</td>
                  <td className={`${purchasingTableTdClass} text-slate-600`}>{m.sku ?? "—"}</td>
                  <td className={`${purchasingTableTdClass} text-slate-600`}>{m.category}</td>
                  <td className={`${purchasingTableTdClass} text-slate-600`}>{m.unit}</td>
                  <td className={`${purchasingTableTdClass} text-right tabular-nums text-slate-600`}>{m.stock}</td>
                  <td className={purchasingTableTdClass}>{m.include_in_bdo ? "Tak" : "Nie"}</td>
                  <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{m.plastic_kg_per_unit}</td>
                  <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{m.paper_kg_per_unit}</td>
                  <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{m.wood_kg_per_unit}</td>
                  <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{m.glass_kg_per_unit}</td>
                  <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{m.metal_kg_per_unit}</td>
                  <td className={purchasingTableTdClass}>
                    <button
                      type="button"
                      onClick={() => openEdit(m)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      title="Pola BDO"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PurchasingTableSection>
      ) : null}

      {modalOpen && editRow ? (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/50 p-4" role="dialog">
          <AppCard className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Pola BDO</h2>
            <p className="mt-1 text-sm text-slate-600">
              {kindLabel(editRow.kind)} · <span className="font-medium text-slate-800">{editRow.name}</span>
            </p>
            <p className="mt-0.5 font-mono text-xs text-slate-500">{editRow.wm_ref}</p>
            <div className="mt-4 space-y-3">
              <PurchasingFilterField label="Typ opakowania (BDO)">
                <input
                  className={purchasingInputClass}
                  value={form.packaging_type}
                  onChange={(e) => setForm((f) => ({ ...f, packaging_type: e.target.value }))}
                  placeholder="np. folia, tektura…"
                />
              </PurchasingFilterField>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.include_in_bdo}
                  onChange={(e) => setForm((f) => ({ ...f, include_in_bdo: e.target.checked }))}
                />
                Uwzględniaj w ewidencji BDO (zakupy, spis, raport)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["plastic_kg_per_unit", "Tworzywo kg / j."],
                    ["paper_kg_per_unit", "Papier kg / j."],
                    ["wood_kg_per_unit", "Drewno kg / j."],
                    ["glass_kg_per_unit", "Szkło kg / j."],
                    ["metal_kg_per_unit", "Metal kg / j."],
                  ] as const
                ).map(([key, label]) => (
                  <PurchasingFilterField key={key} label={label}>
                    <input
                      type="number"
                      step="0.0001"
                      className={purchasingInputClass}
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
                    />
                  </PurchasingFilterField>
                ))}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <AppButton variant="secondary" onClick={() => setModalOpen(false)}>
                Anuluj
              </AppButton>
              <AppButton variant="primary" disabled={saving} onClick={() => void save()}>
                {saving ? "Zapisywanie…" : "Zapisz"}
              </AppButton>
            </div>
          </AppCard>
        </div>
      ) : null}
    </div>
  );
}
