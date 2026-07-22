import { Building2, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppEmptyState } from "../../../components/app-shell";
import { TenantCreateDrawer, TenantDetailDrawer } from "../components/TenantDrawers";
import { useCompanySettings } from "../context/CompanySettingsContext";
import { fmtDateTime } from "../companySettingsUtils";
import { companyCardClass, companyOrangeCtaClass } from "../companySettingsUi";
import type { TenantDto } from "../../../services/warehouseService";

export default function CompanyTenantsTab() {
  const {
    tenants,
    assignments,
    structLoading,
    loadStructure,
    tenantCreateOpen,
    openTenantCreate,
    closeTenantCreate,
  } = useCompanySettings();
  const [selectedTenant, setSelectedTenant] = useState<TenantDto | null>(null);

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

  const rows = tenants.map((t) => ({
    tenant: t,
    warehouseCount: warehouseCountByTenant.get(t.id) ?? 0,
    hasDefault: assignments.some((a) => a.tenant_id === t.id && a.is_default),
  }));

  return (
    <>
      <div className={companyCardClass}>
        {structLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <AppEmptyState
              icon={Building2}
              title="Brak firm"
              description="Dodaj pierwszą firmę, aby przypisać magazyny."
              action={
                <button type="button" className={companyOrangeCtaClass} onClick={openTenantCreate}>
                  + Nowa firma
                </button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3.5">Firma</th>
                  <th className="px-5 py-3.5">Data utworzenia</th>
                  <th className="px-5 py-3.5 text-center">Liczba magazynów</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ tenant, warehouseCount, hasDefault }) => (
                  <tr
                    key={tenant.id}
                    className="cursor-pointer hover:bg-slate-50/80"
                    onClick={() => setSelectedTenant(tenant)}
                  >
                    <td className="px-5 py-4 font-semibold text-slate-900">{tenant.name}</td>
                    <td className="px-5 py-4 text-slate-600">{fmtDateTime(tenant.created_at)}</td>
                    <td className="px-5 py-4 text-center tabular-nums text-slate-800">{warehouseCount}</td>
                    <td className="px-5 py-4">
                      {hasDefault ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                          Skonfigurowana
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                          Brak domyślnego
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-slate-500">Szczegóły &gt;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TenantDetailDrawer tenant={selectedTenant} onClose={() => setSelectedTenant(null)} />
      <TenantCreateDrawer open={tenantCreateOpen} onClose={closeTenantCreate} />
    </>
  );
}
