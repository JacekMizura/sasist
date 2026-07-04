import { useEffect, useState, type MutableRefObject } from "react";

import { COUNTRY_OPTIONS } from "../../../constants/countryCodes";
import {
  CUSTOMER_TYPE_OPTIONS,
  SALES_CHANNEL_OPTIONS,
} from "../../../modules/customers/customerProfile";
import {
  FilterDateRange,
  FilterField,
  FilterGrid,
  FilterPanel,
  FilterPanelBodyWithActions,
  FilterToolbar,
  FilterVisibilityModal,
  ListFilterEmbeddedShell,
  filterInputClass,
  filterSelectClass,
  useFilterFieldOrder,
  type FilterFieldCatalogItem,
} from "../../filters";
import { listSellasistFilterGridClass4 } from "../../listPage/listSellasistTokens";
import type { ListViewActionsBinding } from "../../../preferences/listView/listViewActionsTypes";
import type { AppliedCustomerListFilters } from "./customerListFilterTypes";

/** Bumped for CRM type/channel filters. */
const CUSTOMER_LIST_FILTER_STORAGE_KEY = "customers.list.v3";

const CUSTOMER_LIST_FILTER_CATALOG: FilterFieldCatalogItem[] = [
  { id: "search", label: "Szukaj" },
  { id: "country", label: "Kraj" },
  { id: "customer_type", label: "Typ klienta" },
  { id: "sales_channel", label: "Kanał sprzedaży" },
  { id: "has_orders", label: "Ma zamówienia" },
  { id: "has_email", label: "Ma e-mail" },
  { id: "has_phone", label: "Ma telefon" },
  { id: "date_range", label: "Data utworzenia" },
];

const CUSTOMER_LIST_FILTER_IDS = CUSTOMER_LIST_FILTER_CATALOG.map((c) => c.id);

export type CustomerListFiltersPanelProps = {
  expanded: boolean;
  onToggleExpanded: () => void;
  draft: AppliedCustomerListFilters;
  onChangeDraft: (patch: Partial<AppliedCustomerListFilters>) => void;
  onApply: () => void;
  onClear: () => void;
  /** Jak lista zamówień: pasek filtrów tylko w treści, przełącznik w nagłówku modułu. */
  filterLayout?: "toolbar" | "embedded";
  openFilterFieldsRef?: MutableRefObject<(() => void) | null>;
  listView?: ListViewActionsBinding;
  filterFieldOrder?: string[];
  onFilterFieldOrderSave?: (order: string[]) => void;
};

export function CustomerListFiltersPanel({
  expanded,
  onToggleExpanded,
  draft,
  onChangeDraft,
  onApply,
  onClear,
  filterLayout = "toolbar",
  openFilterFieldsRef,
  listView,
  filterFieldOrder: filterFieldOrderProp,
  onFilterFieldOrderSave,
}: CustomerListFiltersPanelProps) {
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const controlledFieldOrder =
    filterFieldOrderProp && onFilterFieldOrderSave
      ? { order: filterFieldOrderProp, onChange: onFilterFieldOrderSave }
      : undefined;
  const { order: visibleFieldOrder, setOrderFromModal } = useFilterFieldOrder(
    CUSTOMER_LIST_FILTER_STORAGE_KEY,
    CUSTOMER_LIST_FILTER_IDS,
    undefined,
    controlledFieldOrder,
  );

  const embedded = filterLayout === "embedded";
  if (embedded) void onToggleExpanded;

  useEffect(() => {
    if (!openFilterFieldsRef) return;
    openFilterFieldsRef.current = () => setVisibilityOpen(true);
    return () => {
      openFilterFieldsRef.current = null;
    };
  }, [openFilterFieldsRef]);

  const renderField = (fieldId: string) => {
    switch (fieldId) {
      case "search":
        return (
          <FilterField key={fieldId} label="Szukaj">
            <input
              className={filterInputClass}
              value={draft.search}
              onChange={(e) => onChangeDraft({ search: e.target.value })}
              placeholder="Imię, e-mail, telefon, firma, NIP…"
            />
          </FilterField>
        );
      case "country":
        return (
          <FilterField key={fieldId} label="Kraj">
            <select
              className={filterSelectClass}
              value={draft.countryCode}
              onChange={(e) => onChangeDraft({ countryCode: e.target.value })}
            >
              <option value="">Wszystkie</option>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
          </FilterField>
        );
      case "customer_type":
        return (
          <FilterField key={fieldId} label="Typ klienta">
            <select
              className={filterSelectClass}
              value={draft.customerType}
              onChange={(e) =>
                onChangeDraft({ customerType: e.target.value as AppliedCustomerListFilters["customerType"] })
              }
            >
              <option value="">Wszystkie</option>
              {CUSTOMER_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FilterField>
        );
      case "sales_channel":
        return (
          <FilterField key={fieldId} label="Kanał sprzedaży">
            <select
              className={filterSelectClass}
              value={draft.salesChannel}
              onChange={(e) =>
                onChangeDraft({ salesChannel: e.target.value as AppliedCustomerListFilters["salesChannel"] })
              }
            >
              <option value="">Wszystkie</option>
              {SALES_CHANNEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FilterField>
        );
      case "has_orders":
        return (
          <FilterField key={fieldId} label="Ma zamówienia">
            <select
              className={filterSelectClass}
              value={draft.hasOrders}
              onChange={(e) =>
                onChangeDraft({ hasOrders: e.target.value as AppliedCustomerListFilters["hasOrders"] })
              }
            >
              <option value="">Dowolnie</option>
              <option value="yes">Tak</option>
              <option value="no">Nie</option>
            </select>
          </FilterField>
        );
      case "has_email":
        return (
          <FilterField key={fieldId} label="Ma e-mail">
            <select
              className={filterSelectClass}
              value={draft.hasEmail}
              onChange={(e) =>
                onChangeDraft({ hasEmail: e.target.value as AppliedCustomerListFilters["hasEmail"] })
              }
            >
              <option value="">Dowolnie</option>
              <option value="yes">Tak</option>
              <option value="no">Nie</option>
            </select>
          </FilterField>
        );
      case "has_phone":
        return (
          <FilterField key={fieldId} label="Ma telefon">
            <select
              className={filterSelectClass}
              value={draft.hasPhone}
              onChange={(e) =>
                onChangeDraft({ hasPhone: e.target.value as AppliedCustomerListFilters["hasPhone"] })
              }
            >
              <option value="">Dowolnie</option>
              <option value="yes">Tak</option>
              <option value="no">Nie</option>
            </select>
          </FilterField>
        );
      case "date_range":
        return (
          <FilterDateRange
            key={fieldId}
            label="Data utworzenia"
            from={draft.dateFrom}
            to={draft.dateTo}
            onFromChange={(v) => onChangeDraft({ dateFrom: v })}
            onToChange={(v) => onChangeDraft({ dateTo: v })}
          />
        );
      default:
        return null;
    }
  };

  const orderedNodes = visibleFieldOrder.map((id) => renderField(id)).filter(Boolean);

  const filterBody = (
    <FilterPanelBodyWithActions
      onClear={onClear}
      onApply={onApply}
      clearLabel="Wyczyść filtry"
      applyLabel="Filtruj"
      footerMobileOnly={!embedded}
      listView={listView}
    >
      <FilterGrid columnsClassName={embedded ? listSellasistFilterGridClass4 : undefined}>{orderedNodes}</FilterGrid>
    </FilterPanelBodyWithActions>
  );

  return (
    <>
      {embedded ? (
        <ListFilterEmbeddedShell expanded={expanded}>{filterBody}</ListFilterEmbeddedShell>
      ) : (
        <FilterPanel>
          <FilterToolbar
            expanded={expanded}
            onToggleExpanded={onToggleExpanded}
            onClear={onClear}
            onApply={onApply}
            applyLabel="Filtruj"
            clearLabel="Wyczyść filtry"
            showFieldPicker
            onOpenFieldPicker={() => setVisibilityOpen(true)}
            listView={listView}
          />
          {expanded ? filterBody : null}
        </FilterPanel>
      )}
      <FilterVisibilityModal
        open={visibilityOpen}
        onClose={() => setVisibilityOpen(false)}
        title="Widoczne pola — klienci"
        selectedOrder={visibleFieldOrder}
        catalog={CUSTOMER_LIST_FILTER_CATALOG}
        onSave={setOrderFromModal}
      />
    </>
  );
}
