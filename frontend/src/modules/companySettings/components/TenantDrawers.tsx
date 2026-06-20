import { Building2, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppButton } from "../../../components/app-shell";
import {
  PurchasingTableHeader,
  purchasingBtnPrimary,
  purchasingBtnSecondary,
  purchasingSelectClass,
  purchasingTableTdClass,
} from "../../purchasing/ui";
import { companyInputClass, CompanyFormField } from "./CompanyFormField";
import { useCompanySettings } from "../context/CompanySettingsContext";
import { fmtDateTime, roleLabel } from "../companySettingsUtils";
import type { TenantDto } from "../../../services/warehouseService";

type Props = {
  tenant: TenantDto | null;
  onClose: () => void;
};

export function TenantDetailDrawer({ tenant, onClose }: Props) {
  const {
    assignments,
    warehouses,
    warehouseById,
    createAssignment,
    setDefaultWarehouse,
    loadStructure,
  } = useCompanySettings();

  const [assignWarehouseId, setAssignWarehouseId] = useState<number | "">("");
  const [assignRole, setAssignRole] = useState("operator");
  const [assignIsDefault, setAssignIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const tenantAssignments = useMemo(
    () => (tenant ? assignments.filter((a) => a.tenant_id === tenant.id) : []),
    [assignments, tenant],
  );

  useEffect(() => {
    if (tenant) {
      setAssignWarehouseId("");
      setAssignRole("operator");
      setAssignIsDefault(false);
    }
  }, [tenant]);

  if (!tenant) return null;

  const handleAssign = async () => {
    if (assignWarehouseId === "") return;
    setSaving(true);
    try {
      await createAssignment({
        tenant_id: tenant.id,
        warehouse_id: Number(assignWarehouseId),
        role: assignRole,
        is_default: assignIsDefault,
      });
      setAssignWarehouseId("");
      setAssignIsDefault(false);
    } catch {
      /* toast */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Szczegóły firmy ${tenant.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Building2 className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-900">{tenant.name}</h2>
              <p className="text-xs text-slate-500">Utworzono {fmtDateTime(tenant.created_at)} · ID {tenant.id}</p>
            </div>
          </div>
          <button type="button" className={purchasingBtnSecondary} onClick={onClose} aria-label="Zamknij">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Przypisane magazyny</p>
          {tenantAssignments.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Brak przypisań magazynów.</p>
          ) : (
            <table className="mt-2 w-full text-left text-sm">
              <PurchasingTableHeader headers={["Magazyn", "Rola", "Domyślny", ""]} align={["left", "left", "center", "right"]} />
              <tbody className="divide-y divide-slate-100">
                {tenantAssignments.map((a) => (
                  <tr key={a.id}>
                    <td className={purchasingTableTdClass}>{warehouseById(a.warehouse_id)}</td>
                    <td className={purchasingTableTdClass}>{roleLabel(a.role)}</td>
                    <td className={`${purchasingTableTdClass} text-center`}>
                      {a.is_default ? (
                        <span className="text-xs font-semibold text-orange-700">Tak</span>
                      ) : (
                        <button
                          type="button"
                          className="text-xs font-medium text-blue-600 hover:underline"
                          onClick={() => void setDefaultWarehouse(a.id).then(() => loadStructure())}
                        >
                          Ustaw
                        </button>
                      )}
                    </td>
                    <td className={`${purchasingTableTdClass} text-right text-xs text-slate-500`}>#{a.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-500">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Nowe przypisanie
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <CompanyFormField label="Magazyn">
                <select
                  className={purchasingSelectClass}
                  value={assignWarehouseId === "" ? "" : String(assignWarehouseId)}
                  onChange={(e) => setAssignWarehouseId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">— wybierz —</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </CompanyFormField>
              <CompanyFormField label="Rola">
                <select className={purchasingSelectClass} value={assignRole} onChange={(e) => setAssignRole(e.target.value)}>
                  <option value="owner">Właściciel</option>
                  <option value="client">Klient</option>
                  <option value="operator">Operator</option>
                </select>
              </CompanyFormField>
            </div>
            <label className="mt-3 flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={assignIsDefault} onChange={(e) => setAssignIsDefault(e.target.checked)} />
              <span className="text-sm text-slate-700">Domyślny magazyn dla tej firmy</span>
            </label>
            <AppButton
              variant="primary"
              className={`${purchasingBtnPrimary} mt-4`}
              disabled={assignWarehouseId === "" || saving}
              onClick={() => void handleAssign()}
            >
              Dodaj przypisanie
            </AppButton>
          </div>
        </div>
      </aside>
    </div>
  );
}

type CreateTenantDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function TenantCreateDrawer({ open, onClose }: CreateTenantDrawerProps) {
  const { createTenant } = useCompanySettings();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation" onClick={onClose}>
      <aside className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Nowa firma</h2>
          <button type="button" className={purchasingBtnSecondary} onClick={onClose} aria-label="Zamknij">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          <CompanyFormField label="Nazwa firmy">
            <input className={companyInputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Nazwa spółki" />
          </CompanyFormField>
        </div>
        <div className="mt-auto flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <AppButton variant="secondary" className={purchasingBtnSecondary} onClick={onClose}>
            Anuluj
          </AppButton>
          <AppButton
            variant="primary"
            className={purchasingBtnPrimary}
            disabled={!name.trim() || saving}
            onClick={() => {
              setSaving(true);
              void createTenant(name)
                .then(onClose)
                .finally(() => setSaving(false));
            }}
          >
            {saving ? "Tworzenie…" : "Utwórz firmę"}
          </AppButton>
        </div>
      </aside>
    </div>
  );
}
