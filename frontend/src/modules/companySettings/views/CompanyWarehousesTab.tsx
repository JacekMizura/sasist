import { createPortal } from "react-dom";
import { Loader2, MoreHorizontal, Warehouse } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { AppEmptyState } from "../../../components/app-shell";
import { FULFILLMENT_ASSIGNMENT_MODE_OPTIONS } from "../../../api/fulfillmentConfigurationApi";
import { WarehouseCreateDrawer, WarehouseEditDrawer } from "../components/WarehouseDrawers";
import { useCompanySettings } from "../context/CompanySettingsContext";
import { fmtDateTime, warehouseProfileLabel, warehouseTypeLabel } from "../companySettingsUtils";
import { companyCardClass, companyOrangeCtaClass } from "../companySettingsUi";
import type { Warehouse as WarehouseType } from "../../../services/warehouseService";

type MenuState = { warehouseId: number; top: number; left: number } | null;

export default function CompanyWarehousesTab() {
  const {
    warehouses,
    structLoading,
    loadStructure,
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
    warehouseCreateOpen,
    openWarehouseCreate,
    closeWarehouseCreate,
  } = useCompanySettings();

  const [editWarehouse, setEditWarehouse] = useState<WarehouseType | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);

  useEffect(() => {
    void loadStructure();
  }, [loadStructure]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("[data-company-wh-menu]") || el?.closest("[data-company-wh-trigger]")) return;
      setMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const rows = useMemo(
    () =>
      warehouses.map((w) => {
        const assignment = assignmentForTenantWarehouse(w.id);
        const isDefault = assignment?.is_default ?? false;
        return { w, assignment, isDefault };
      }),
    [warehouses, assignmentForTenantWarehouse],
  );

  const openMenu = (warehouseId: number, trigger: HTMLElement) => {
    const r = trigger.getBoundingClientRect();
    const width = 220;
    setMenu({
      warehouseId,
      top: r.bottom + 4,
      left: Math.min(r.right - width, window.innerWidth - width - 8),
    });
  };

  const menuRow = menu ? rows.find((r) => r.w.id === menu.warehouseId) : null;

  const menuPortal =
    menu && menuRow && typeof document !== "undefined"
      ? createPortal(
          <div
            data-company-wh-menu
            className="fixed z-[200] min-w-[220px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/70"
            style={{ top: menu.top, left: menu.left }}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
              onClick={() => {
                setEditWarehouse(menuRow.w);
                setMenu(null);
              }}
            >
              Edytuj magazyn
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={menuRow.isDefault || menuRow.assignment == null}
              className="flex w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => {
                if (menuRow.assignment) void setDefaultWarehouse(menuRow.assignment.id);
                setMenu(null);
              }}
            >
              Ustaw jako domyślny
            </button>
            <button
              type="button"
              role="menuitem"
              disabled
              className="flex w-full px-3 py-2 text-left text-sm text-slate-400"
              onClick={() => toast("Archiwizacja magazynów będzie dostępna w kolejnej wersji.")}
            >
              Archiwizuj
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="min-w-0 space-y-5">
        <div className={companyCardClass}>
          {structLoading ? (
            <div className="flex justify-center py-12 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <AppEmptyState
                icon={Warehouse}
                title="Brak magazynów"
                description="Dodaj pierwszy magazyn, aby rozpocząć konfigurację."
                action={
                  <button type="button" className={companyOrangeCtaClass} onClick={openWarehouseCreate}>
                    + Nowy magazyn
                  </button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3.5">Nazwa</th>
                    <th className="px-5 py-3.5">Typ</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-center">Domyślny</th>
                    <th className="px-5 py-3.5">Utworzono</th>
                    <th className="px-5 py-3.5 text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(({ w, isDefault }) => (
                    <tr key={w.id} className="hover:bg-slate-50/80">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">{w.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{warehouseProfileLabel(w.requires_putaway)}</div>
                      </td>
                      <td className="px-5 py-4 text-slate-700">{warehouseTypeLabel(w.type)}</td>
                      <td className="px-5 py-4 font-medium text-emerald-600">Aktywny</td>
                      <td className="px-5 py-4 text-center">
                        {isDefault ? (
                          <span className="inline-flex rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-orange-600">
                            Domyślny
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{fmtDateTime(w.created_at)}</td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          data-company-wh-trigger
                          aria-label="Więcej akcji"
                          aria-expanded={menu?.warehouseId === w.id}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (menu?.warehouseId === w.id) setMenu(null);
                            else openMenu(w.id, e.currentTarget);
                          }}
                        >
                          <MoreHorizontal className="h-5 w-5" strokeWidth={2} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <section className={`${companyCardClass} border-t-2 border-t-orange-400`}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
              <div>
                <h2 className="text-base font-bold text-slate-900">Strategia realizacji zamówień</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Konfiguracja przypisania magazynu realizacji dla nowych zamówień.
                </p>
              </div>
            </div>
          </div>

          {fulfillmentCfgLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
            </div>
          ) : (
            <div className="space-y-3 px-5 py-5">
              {FULFILLMENT_ASSIGNMENT_MODE_OPTIONS.map((opt) => {
                const selected = fulfillmentMode === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 transition ${
                      selected
                        ? "border-orange-400 bg-orange-50/50 ring-1 ring-orange-200/60"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="fulfillment-mode"
                      className="mt-1 h-4 w-4 border-slate-300 text-orange-500 accent-orange-500"
                      checked={selected}
                      onChange={() => setFulfillmentMode(opt.value)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{opt.label}</span>
                      <span
                        className={`mt-0.5 block text-xs ${
                          opt.value === "AUTO_ATP_FUTURE" ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        {opt.description}
                      </span>
                    </span>
                  </label>
                );
              })}

              <div className="pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Magazyn konsolidacyjny (opcjonalnie)
                </p>
                <select
                  className="mt-2 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
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

              <div className="flex justify-end border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className={companyOrangeCtaClass}
                  disabled={!fulfillmentModeDirty || fulfillmentCfgSaving}
                  onClick={() => void saveFulfillmentConfiguration()}
                >
                  {fulfillmentCfgSaving ? "Zapisywanie…" : "Zapisz strategię"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {menuPortal}
      <WarehouseCreateDrawer open={warehouseCreateOpen} onClose={closeWarehouseCreate} />
      <WarehouseEditDrawer warehouse={editWarehouse} onClose={() => setEditWarehouse(null)} />
    </>
  );
}
