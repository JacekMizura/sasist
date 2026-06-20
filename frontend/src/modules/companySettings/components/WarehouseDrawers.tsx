import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { AppButton } from "../../../components/app-shell";
import { companyInputClass, CompanyFormField } from "./CompanyFormField";
import { purchasingBtnPrimary, purchasingBtnSecondary } from "../../purchasing/ui";
import type { Warehouse } from "../../../services/warehouseService";
import { useCompanySettings } from "../context/CompanySettingsContext";

type Props = {
  warehouse: Warehouse | null;
  onClose: () => void;
};

export function WarehouseEditDrawer({ warehouse, onClose }: Props) {
  const { assignmentForTenantWarehouse, saveWarehouseEdit } = useCompanySettings();
  const [name, setName] = useState("");
  const [requiresPutaway, setRequiresPutaway] = useState(true);
  const [participatesNetwork, setParticipatesNetwork] = useState(true);
  const [fulfillmentEligible, setFulfillmentEligible] = useState(true);
  const [fulfillmentPriority, setFulfillmentPriority] = useState(100);
  const [saving, setSaving] = useState(false);

  const assignment = warehouse ? assignmentForTenantWarehouse(warehouse.id) : null;

  useEffect(() => {
    if (!warehouse) return;
    setName(warehouse.name);
    setRequiresPutaway(warehouse.requires_putaway !== false);
    setParticipatesNetwork(assignment?.participates_in_network_stock ?? true);
    setFulfillmentEligible(assignment?.fulfillment_eligible ?? true);
    setFulfillmentPriority(assignment?.fulfillment_priority ?? 100);
  }, [warehouse, assignment]);

  if (!warehouse) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveWarehouseEdit({
        warehouseId: warehouse.id,
        name,
        requiresPutaway,
        assignmentId: assignment?.id ?? null,
        participatesNetwork,
        fulfillmentEligible,
        fulfillmentPriority,
      });
      onClose();
    } catch {
      /* toast in context */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Edycja magazynu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Edycja magazynu</h2>
            <p className="text-xs text-slate-500">ID {warehouse.id}</p>
          </div>
          <button type="button" className={purchasingBtnSecondary} onClick={onClose} aria-label="Zamknij">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
          <CompanyFormField label="Nazwa">
            <input className={companyInputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </CompanyFormField>

          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Profil przyjęć</p>
            <label className="mt-3 flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" checked={requiresPutaway} onChange={(e) => setRequiresPutaway(e.target.checked)} />
              <span className="min-w-0 text-sm text-slate-700">
                Wymaga rozlokowania (WMS) — towar trafia na DOCK-IN i wymaga putaway przed sprzedażą.
              </span>
            </label>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Realizacja zamówień</p>
            {assignment == null ? (
              <p className="mt-2 text-sm text-amber-800">
                Brak przypisania do bieżącej firmy — dodaj przypisanie w zakładce „Firmy i przypisania”.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" checked={participatesNetwork} onChange={(e) => setParticipatesNetwork(e.target.checked)} />
                  <span className="text-sm text-slate-700">Uwzględniaj w stanie sieciowym</span>
                </label>
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" checked={fulfillmentEligible} onChange={(e) => setFulfillmentEligible(e.target.checked)} />
                  <span className="text-sm text-slate-700">Magazyn może realizować zamówienia</span>
                </label>
                <CompanyFormField label="Priorytet realizacji">
                  <input type="number" min={1} className={companyInputClass} value={fulfillmentPriority} onChange={(e) => setFulfillmentPriority(Number(e.target.value) || 1)} />
                </CompanyFormField>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <AppButton variant="secondary" className={purchasingBtnSecondary} disabled={saving} onClick={onClose}>
            Anuluj
          </AppButton>
          <AppButton variant="primary" className={purchasingBtnPrimary} disabled={saving} onClick={() => void handleSave()}>
            {saving ? "Zapisywanie…" : "Zapisz"}
          </AppButton>
        </div>
      </aside>
    </div>
  );
}

type CreateProps = {
  open: boolean;
  onClose: () => void;
};

export function WarehouseCreateDrawer({ open, onClose }: CreateProps) {
  const { createWarehouse } = useCompanySettings();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  if (!open) return null;

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createWarehouse(name);
      onClose();
    } catch {
      /* toast */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation" onClick={onClose}>
      <aside className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Nowy magazyn</h2>
          <button type="button" className={purchasingBtnSecondary} onClick={onClose} aria-label="Zamknij">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          <CompanyFormField label="Nazwa magazynu">
            <input className={companyInputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Magazyn centralny" />
          </CompanyFormField>
          <p className="mt-2 text-xs text-slate-500">Po utworzeniu przypisz magazyn do firmy w zakładce „Firmy i przypisania”.</p>
        </div>
        <div className="mt-auto flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <AppButton variant="secondary" className={purchasingBtnSecondary} onClick={onClose}>
            Anuluj
          </AppButton>
          <AppButton variant="primary" className={purchasingBtnPrimary} disabled={!name.trim() || saving} onClick={() => void handleCreate()}>
            {saving ? "Tworzenie…" : "Utwórz magazyn"}
          </AppButton>
        </div>
      </aside>
    </div>
  );
}

export function WarehouseEditDrawerLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
    </div>
  );
}
