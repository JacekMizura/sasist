import {
  FilterField,
  FilterGrid,
  FilterPanelBodyWithActions,
  ListFilterEmbeddedShell,
  filterInputClass,
  filterSelectClass,
} from "../../filters";
import { listSellasistFilterGridClass4 } from "../../listPage/listSellasistTokens";
import type { AppliedManufacturerListFilters } from "./manufacturerListFilterTypes";

type Tenant = { id: number; name: string };

export type ManufacturerListFiltersPanelProps = {
  expanded: boolean;
  draft: AppliedManufacturerListFilters;
  onChangeDraft: (patch: Partial<AppliedManufacturerListFilters>) => void;
  onApply: () => void;
  onClear: () => void;
  tenants: Tenant[];
  tenantId: number;
  onTenantChange: (tenantId: number) => void;
};

export function ManufacturerListFiltersPanel({
  expanded,
  draft,
  onChangeDraft,
  onApply,
  onClear,
  tenants,
  tenantId,
  onTenantChange,
}: ManufacturerListFiltersPanelProps) {
  return (
    <ListFilterEmbeddedShell expanded={expanded}>
      <FilterPanelBodyWithActions
        onClear={onClear}
        onApply={onApply}
        clearLabel="Wyczyść filtry"
        applyLabel="Filtruj"
        footerMobileOnly={false}
      >
        <div className="space-y-2">
          <FilterGrid columnsClassName={listSellasistFilterGridClass4}>
            <FilterField label="Tenant">
              <select
                className={filterSelectClass}
                value={tenantId}
                onChange={(e) => onTenantChange(Number(e.target.value))}
              >
                {tenants.length === 0 ? (
                  <option value={tenantId}>Tenant #{tenantId}</option>
                ) : (
                  tenants.map((tn) => (
                    <option key={tn.id} value={tn.id}>
                      {tn.name}
                    </option>
                  ))
                )}
              </select>
            </FilterField>
            <FilterField label="Nazwa">
              <input
                type="text"
                className={filterInputClass}
                value={draft.name}
                onChange={(e) => onChangeDraft({ name: e.target.value })}
                placeholder="Szukaj po nazwie…"
              />
            </FilterField>
            <FilterField label="Kraj">
              <input
                type="text"
                className={filterInputClass}
                value={draft.country}
                onChange={(e) => onChangeDraft({ country: e.target.value })}
                placeholder="np. Polska"
              />
            </FilterField>
            <FilterField label="Status">
              <select
                className={filterSelectClass}
                value={draft.status}
                onChange={(e) =>
                  onChangeDraft({ status: e.target.value as AppliedManufacturerListFilters["status"] })
                }
              >
                <option value="all">Wszystkie</option>
                <option value="active">Aktywne</option>
                <option value="inactive">Nieaktywne</option>
              </select>
            </FilterField>
          </FilterGrid>
          <FilterGrid columnsClassName={listSellasistFilterGridClass4}>
            <FilterField label="NIP">
              <input
                type="text"
                className={filterInputClass}
                value={draft.nip}
                onChange={(e) => onChangeDraft({ nip: e.target.value })}
                placeholder="Numer NIP…"
              />
            </FilterField>
            <FilterField label="Miasto">
              <input
                type="text"
                className={filterInputClass}
                value={draft.city}
                onChange={(e) => onChangeDraft({ city: e.target.value })}
                placeholder="Miasto…"
              />
            </FilterField>
            <FilterField label="E-mail">
              <input
                type="text"
                className={filterInputClass}
                value={draft.email}
                onChange={(e) => onChangeDraft({ email: e.target.value })}
                placeholder="E-mail…"
              />
            </FilterField>
            <FilterField label="Telefon">
              <input
                type="text"
                className={filterInputClass}
                value={draft.phone}
                onChange={(e) => onChangeDraft({ phone: e.target.value })}
                placeholder="Telefon…"
              />
            </FilterField>
          </FilterGrid>
          <FilterGrid columnsClassName={listSellasistFilterGridClass4}>
            <FilterField label="Dostawca">
              <input
                type="text"
                className={filterInputClass}
                value={draft.supplier}
                onChange={(e) => onChangeDraft({ supplier: e.target.value })}
                placeholder="Nazwa dostawcy…"
              />
            </FilterField>
          </FilterGrid>
        </div>
      </FilterPanelBodyWithActions>
    </ListFilterEmbeddedShell>
  );
}
