import {
  FilterField,
  FilterGrid,
  FilterPanelBodyWithActions,
  ListFilterEmbeddedShell,
  filterInputClass,
  filterSelectClass,
} from "../../filters";
import { listSellasistFilterGridClass4 } from "../../listPage/listSellasistTokens";
import type { AppliedSupplierListFilters } from "./supplierListFilterTypes";

type Tenant = { id: number; name: string };

export type SupplierListFiltersPanelProps = {
  expanded: boolean;
  draft: AppliedSupplierListFilters;
  onChangeDraft: (patch: Partial<AppliedSupplierListFilters>) => void;
  onApply: () => void;
  onClear: () => void;
  tenants: Tenant[];
  tenantId: number;
  onTenantChange: (tenantId: number) => void;
};

export function SupplierListFiltersPanel({
  expanded,
  draft,
  onChangeDraft,
  onApply,
  onClear,
  tenants,
  tenantId,
  onTenantChange,
}: SupplierListFiltersPanelProps) {
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
            <FilterField label="Podmiot">
              <select
                className={filterSelectClass}
                value={tenantId}
                onChange={(e) => onTenantChange(Number(e.target.value))}
              >
                {tenants.length === 0 ? (
                  <option value={tenantId}>#{tenantId}</option>
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
                placeholder="Szukaj…"
              />
            </FilterField>
            <FilterField label="Status">
              <select
                className={filterSelectClass}
                value={draft.status}
                onChange={(e) =>
                  onChangeDraft({ status: e.target.value as AppliedSupplierListFilters["status"] })
                }
              >
                <option value="all">Wszystkie</option>
                <option value="active">Aktywne</option>
                <option value="inactive">Nieaktywne</option>
              </select>
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
          </FilterGrid>
          <FilterGrid columnsClassName={listSellasistFilterGridClass4}>
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
            <FilterField label="Waluta">
              <input
                type="text"
                className={filterInputClass}
                value={draft.currency}
                onChange={(e) => onChangeDraft({ currency: e.target.value })}
                placeholder="np. PLN"
              />
            </FilterField>
          </FilterGrid>
          <FilterGrid columnsClassName={listSellasistFilterGridClass4}>
            <FilterField label="MOQ wymagane">
              <select
                className={filterSelectClass}
                value={draft.requiresMoq}
                onChange={(e) =>
                  onChangeDraft({ requiresMoq: e.target.value as AppliedSupplierListFilters["requiresMoq"] })
                }
              >
                <option value="">Dowolnie</option>
                <option value="yes">Tak</option>
                <option value="no">Nie</option>
              </select>
            </FilterField>
            <FilterField label="Darmowa dostawa">
              <select
                className={filterSelectClass}
                value={draft.freeShipping}
                onChange={(e) =>
                  onChangeDraft({ freeShipping: e.target.value as AppliedSupplierListFilters["freeShipping"] })
                }
              >
                <option value="">Dowolnie</option>
                <option value="yes">Tak</option>
                <option value="no">Nie</option>
              </select>
            </FilterField>
            <FilterField label="Min. liczba produktów">
              <input
                type="number"
                min={0}
                className={filterInputClass}
                value={draft.minProductCount}
                onChange={(e) => onChangeDraft({ minProductCount: e.target.value })}
                placeholder="0"
              />
            </FilterField>
            <FilterField label="Min. liczba zamówień">
              <input
                type="number"
                min={0}
                className={filterInputClass}
                value={draft.minOrderCount}
                onChange={(e) => onChangeDraft({ minOrderCount: e.target.value })}
                placeholder="0"
              />
            </FilterField>
          </FilterGrid>
        </div>
      </FilterPanelBodyWithActions>
    </ListFilterEmbeddedShell>
  );
}
