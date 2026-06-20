import { Building2, Link2, Loader2, Plus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppButton, AppEmptyState } from "../../../components/app-shell";
import {
  PurchasingKpiCard,
  PurchasingKpiGrid,
  PurchasingPageHeader,
  PurchasingPageShell,
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingBtnPrimary,
  purchasingTableTdClass,
} from "../../purchasing/ui";
import { TenantCreateDrawer, TenantDetailDrawer } from "../components/TenantDrawers";
import { useCompanySettings } from "../context/CompanySettingsContext";
import { fmtDateTime } from "../companySettingsUtils";
import type { TenantDto } from "../../../services/warehouseService";

export default function CompanyTenantsTab() {
  const { tenants, assignments, structLoading, loadStructure } = useCompanySettings();
  const [selectedTenant, setSelectedTenant] = useState<TenantDto | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    void loadStructure();
  }, [loadStructure]);

  const warehouseCountByTenant = useMemo(() => {
    const map = new Map<number, number>();
    for (const a of assignments) {
      map.set(a.tenant_id, (map.get(a.tenant_id) ?? 0) + 1);
    }
    return map;
  }, [assignments]);

  const defaultAssignmentsCount = assignments.filter((a) => a.is_default).length;
  const assignedWarehouses = new Set(assignments.map((a) => a.warehouse_id)).size;

  const rows = tenants.map((t) => ({
    tenant: t,
    warehouseCount: warehouseCountByTenant.get(t.id) ?? 0,
    hasDefault: assignments.some((a) => a.tenant_id === t.id && a.is_default),
  }));

  return (
    <>
      <PurchasingPageShell
        header={
          <PurchasingPageHeader
            title="Firmy i przypisania"
            subtitle="Firmy w systemie, przypisania magazynów, role dostępu i ustawienia domyślne."
          />
        }
        kpis={
          structLoading ? null : (
            <PurchasingKpiGrid>
              <PurchasingKpiCard title="Liczba firm" value={String(tenants.length)} icon={<Building2 aria-hidden />} />
              <PurchasingKpiCard title="Liczba przypisań" value={String(assignments.length)} icon={<Link2 aria-hidden />} />
              <PurchasingKpiCard title="Magazynów przypisanych" value={String(assignedWarehouses)} icon={<Users aria-hidden />} />
              <PurchasingKpiCard title="Domyślne przypisania" value={String(defaultAssignmentsCount)} icon={<Link2 aria-hidden />} />
            </PurchasingKpiGrid>
          )
        }
        table={
          <PurchasingTableSection
            title="Firmy"
            subtitle="Kliknij wiersz, aby zobaczyć przypisane magazyny i role."
            indicatorClass="bg-teal-500"
            action={
              <AppButton variant="primary" className={purchasingBtnPrimary} onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                Nowa firma
              </AppButton>
            }
          >
            {structLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
              </div>
            ) : rows.length === 0 ? (
              <AppEmptyState
                icon={Building2}
                title="Brak firm"
                description="Dodaj pierwszą firmę, aby przypisać magazyny."
                action={
                  <AppButton variant="primary" className={purchasingBtnPrimary} onClick={() => setCreateOpen(true)}>
                    + Nowa firma
                  </AppButton>
                }
              />
            ) : (
              <table className="w-full min-w-[640px] text-left text-sm">
                <PurchasingTableHeader
                  headers={["Firma", "Data utworzenia", "Liczba magazynów", "Status", ""]}
                  align={["left", "left", "right", "left", "right"]}
                />
                <tbody className="divide-y divide-slate-100">
                  {rows.map(({ tenant, warehouseCount, hasDefault }) => (
                    <tr
                      key={tenant.id}
                      className="cursor-pointer hover:bg-slate-50/80"
                      onClick={() => setSelectedTenant(tenant)}
                    >
                      <td className={`${purchasingTableTdClass} font-medium text-slate-900`}>{tenant.name}</td>
                      <td className={`${purchasingTableTdClass} text-slate-600`}>{fmtDateTime(tenant.created_at)}</td>
                      <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{warehouseCount}</td>
                      <td className={purchasingTableTdClass}>
                        {hasDefault ? (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">Skonfigurowana</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Brak domyślnego</span>
                        )}
                      </td>
                      <td className={`${purchasingTableTdClass} text-right text-xs text-blue-600`}>Szczegóły →</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PurchasingTableSection>
        }
      />

      <TenantDetailDrawer tenant={selectedTenant} onClose={() => setSelectedTenant(null)} />
      <TenantCreateDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
