import { Loader2, Plus, Settings2, Warehouse } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { AppEmptyState } from "../../../components/app-shell";
import {
  FULFILLMENT_ASSIGNMENT_MODE_OPTIONS,
} from "../../../api/fulfillmentConfigurationApi";
import {
  PurchasingKpiCard,
  PurchasingKpiGrid,
  PurchasingPageHeader,
  PurchasingPageShell,
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingBtnPrimary,
  purchasingSelectClass,
  purchasingTableTdClass,
} from "../../purchasing/ui";
import { CompanyRowIconActions } from "../components/CompanyRowIconActions";
import { WarehouseCreateDrawer, WarehouseEditDrawer } from "../components/WarehouseDrawers";
import { useCompanySettings } from "../context/CompanySettingsContext";
import {
  fmtDateTime,
  warehouseProfileLabel,
  warehouseTypeLabel,
} from "../companySettingsUtils";
import type { Warehouse as WarehouseType } from "../../../services/warehouseService";
import { AppButton } from "../../../components/app-shell";

export default function CompanyWarehousesTab() {
  const {
    warehouses,
    structLoading,
    loadStructure,
    defaultWarehouseName,
    fulfillmentMode,
    setFulfillmentMode,
    consolidationWarehouseId,
    setConsolidationWarehouseId,
    fulfillmentModeDirty,
    fulfillmentCfgLoading,
    fulfillmentCfgSaving,
    saveFulfillmentConfiguration,
    eligibleConsolidationWarehouses,
    assignmentForTenantWarehouse,
    setDefaultWarehouse,
  } = useCompanySettings();

  const [createOpen, setCreateOpen] = useState(false);
  const [editWarehouse, setEditWarehouse] = useState<WarehouseType | null>(null);

  useEffect(() => {
    void loadStructure();
  }, [loadStructure]);

  const activeCount = warehouses.length;
  const strategyLabel =
    FULFILLMENT_ASSIGNMENT_MODE_OPTIONS.find((o) => o.value === fulfillmentMode)?.label ?? fulfillmentMode;

  const rows = useMemo(
    () =>
      warehouses.map((w) => {
        const assignment = assignmentForTenantWarehouse(w.id);
        const isDefault = assignment?.is_default ?? false;
        return { w, assignment, isDefault };
      }),
    [warehouses, assignmentForTenantWarehouse],
  );

  return (
    <>
      <PurchasingPageShell
        header={
          <PurchasingPageHeader
            title="Magazyny"
            subtitle="Zarządzanie magazynami, magazynem domyślnym i strategią realizacji zamówień."
          />
        }
        kpis={
          structLoading ? null : (
            <PurchasingKpiGrid>
              <PurchasingKpiCard title="Liczba magazynów" value={String(activeCount)} icon={<Warehouse aria-hidden />} />
              <PurchasingKpiCard title="Magazyn domyślny" value={defaultWarehouseName} icon={<Settings2 aria-hidden />} />
              <PurchasingKpiCard title="Strategia realizacji" value={strategyLabel} icon={<Settings2 aria-hidden />} />
              <PurchasingKpiCard title="Magazynów aktywnych" value={String(activeCount)} icon={<Warehouse aria-hidden />} />
            </PurchasingKpiGrid>
          )
        }
        table={
          <>
            <PurchasingTableSection
              title="Magazyny"
              subtitle="Lista magazynów przypisanych do organizacji."
              indicatorClass="bg-blue-500"
              action={
                <AppButton variant="primary" className={purchasingBtnPrimary} onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                  Nowy magazyn
                </AppButton>
              }
            >
              {structLoading ? (
                <div className="flex justify-center py-12 text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
                </div>
              ) : rows.length === 0 ? (
                <AppEmptyState
                  icon={Warehouse}
                  title="Brak magazynów"
                  description="Dodaj pierwszy magazyn, aby rozpocząć konfigurację."
                  action={
                    <AppButton variant="primary" className={purchasingBtnPrimary} onClick={() => setCreateOpen(true)}>
                      + Nowy magazyn
                    </AppButton>
                  }
                />
              ) : (
                <table className="w-full min-w-[720px] text-left text-sm">
                  <PurchasingTableHeader
                    headers={["Nazwa", "Typ", "Status", "Domyślny", "Utworzono", "Akcje"]}
                    align={["left", "left", "left", "center", "left", "right"]}
                  />
                  <tbody className="divide-y divide-slate-100">
                    {rows.map(({ w, assignment, isDefault }) => (
                      <tr key={w.id} className="hover:bg-slate-50/80">
                        <td className={`${purchasingTableTdClass} font-medium text-slate-900`}>
                          {w.name}
                          <div className="text-xs font-normal text-slate-500">{warehouseProfileLabel(w.requires_putaway)}</div>
                        </td>
                        <td className={purchasingTableTdClass}>{warehouseTypeLabel(w.type)}</td>
                        <td className={purchasingTableTdClass}>
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">Aktywny</span>
                        </td>
                        <td className={`${purchasingTableTdClass} text-center`}>
                          {isDefault ? (
                            <span className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-800">Domyślny</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className={`${purchasingTableTdClass} text-slate-600`}>{fmtDateTime(w.created_at)}</td>
                        <td className={`${purchasingTableTdClass} text-right`}>
                          <CompanyRowIconActions
                            actions={[
                              {
                                id: "edit",
                                label: "Edytuj magazyn",
                                icon: "edit",
                                onClick: () => setEditWarehouse(w),
                              },
                              {
                                id: "default",
                                label: "Ustaw jako domyślny",
                                icon: "default",
                                disabled: isDefault || assignment == null,
                                onClick: () => {
                                  if (assignment) void setDefaultWarehouse(assignment.id);
                                },
                              },
                              {
                                id: "archive",
                                label: "Archiwizacja magazynów — wkrótce",
                                icon: "archive",
                                disabled: true,
                                onClick: () => toast("Archiwizacja magazynów będzie dostępna w kolejnej wersji."),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </PurchasingTableSection>

            <PurchasingTableSection
              title="Strategia realizacji zamówień"
              subtitle="Konfiguracja przypisania magazynu realizacji dla nowych zamówień."
              indicatorClass="bg-violet-500"
              className="mt-4"
            >
              {fulfillmentCfgLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
                </div>
              ) : (
                <div className="space-y-4 px-4 py-4">
                  {FULFILLMENT_ASSIGNMENT_MODE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
                        fulfillmentMode === opt.value ? "border-orange-200 bg-orange-50/40" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="fulfillment-mode"
                        className="mt-1 h-4 w-4 border-slate-300 text-orange-600"
                        checked={fulfillmentMode === opt.value}
                        onChange={() => setFulfillmentMode(opt.value)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{opt.label}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{opt.description}</span>
                      </span>
                    </label>
                  ))}
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Magazyn konsolidacyjny (opcjonalnie)</p>
                    <select
                      className={`${purchasingSelectClass} mt-2 max-w-md`}
                      value={consolidationWarehouseId === "" ? "" : String(consolidationWarehouseId)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setConsolidationWarehouseId(v === "" ? "" : Number(v));
                      }}
                    >
                      <option value="">— automatycznie (resolver) —</option>
                      {eligibleConsolidationWarehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end border-t border-slate-100 pt-3">
                    <AppButton
                      variant="primary"
                      className={purchasingBtnPrimary}
                      disabled={!fulfillmentModeDirty || fulfillmentCfgSaving}
                      onClick={() => void saveFulfillmentConfiguration()}
                    >
                      {fulfillmentCfgSaving ? "Zapisywanie…" : "Zapisz strategię"}
                    </AppButton>
                  </div>
                </div>
              )}
            </PurchasingTableSection>
          </>
        }
      />

      <WarehouseCreateDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
      <WarehouseEditDrawer warehouse={editWarehouse} onClose={() => setEditWarehouse(null)} />
    </>
  );
}
