import { useEffect, useState, type MutableRefObject } from "react";

import type { ShippingMethodDto } from "../../../api/shippingMethodsApi";
import type { ReturnUiStatusPanelSummary, ReturnStatusRead } from "../../../types/wmsReturn";
import {
  FilterDateRange,
  FilterField,
  FilterGrid,
  FilterMultiSelect,
  FilterPanel,
  FilterPanelBodyWithActions,
  FilterShippingMethodSelect,
  FilterToolbar,
  FilterVisibilityModal,
  ListFilterEmbeddedShell,
  filterInputClass,
  filterSelectClass,
  useFilterFieldOrder,
  type FilterFieldCatalogItem,
} from "../../filters";
import type { AppliedReturnListFilters } from "./returnListFilterTypes";
import { listSellasistFilterGridClass4 } from "../../listPage/listSellasistTokens";

/** Zgodne z etykietami kubełków na liście zamówień / panelu statusów. */
const RETURN_PANEL_GROUP_LABELS: Record<"NEW" | "IN_PROGRESS" | "DONE", string> = {
  NEW: "Nowe",
  IN_PROGRESS: "W toku",
  DONE: "Zakończone",
};

/** Bumped for unified `date_range` field id. */
const RETURN_LIST_FILTER_STORAGE_KEY = "returns.list.v2";

const RETURN_LIST_FILTER_CATALOG: FilterFieldCatalogItem[] = [
  { id: "search", label: "Szukaj" },
  { id: "return_status", label: "Status zwrotu (workflow)" },
  { id: "panel_status_multi", label: "Status panelu" },
  { id: "date_range", label: "Data utworzenia zwrotu" },
  { id: "order_number", label: "Numer zamówienia" },
  { id: "customer", label: "Klient" },
  { id: "warehouse", label: "Magazyn" },
  { id: "courier", label: "Kurier / metoda dostawy" },
  { id: "has_panel_label", label: "Etykieta panelu" },
  { id: "tracking", label: "Numer śledzenia" },
  { id: "archive_scope", label: "Archiwum" },
];

const RETURN_LIST_FILTER_IDS = RETURN_LIST_FILTER_CATALOG.map((c) => c.id);

export type ReturnListFiltersPanelProps = {
  expanded: boolean;
  onToggleExpanded: () => void;
  draft: AppliedReturnListFilters;
  onChangeDraft: (patch: Partial<AppliedReturnListFilters>) => void;
  onApply: () => void;
  onClear: () => void;
  panelSummary: ReturnUiStatusPanelSummary | null;
  warehouses: { id: number; name: string }[];
  shippingMethods: ShippingMethodDto[];
  returnStatuses: ReturnStatusRead[];
  /** Jak lista zamówień: przełącznik filtrów w nagłówku, bez paska narzędzi w panelu. */
  filterLayout?: "toolbar" | "embedded";
  openFilterFieldsRef?: MutableRefObject<(() => void) | null>;
};

export function ReturnListFiltersPanel({
  expanded,
  onToggleExpanded,
  draft,
  onChangeDraft,
  onApply,
  onClear,
  panelSummary,
  warehouses,
  shippingMethods,
  returnStatuses,
  filterLayout = "toolbar",
  openFilterFieldsRef,
}: ReturnListFiltersPanelProps) {
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const { order: visibleFieldOrder, setOrderFromModal } = useFilterFieldOrder(
    RETURN_LIST_FILTER_STORAGE_KEY,
    RETURN_LIST_FILTER_IDS,
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

  const panelStatusOptions = (panelSummary?.groups ?? []).flatMap((block) =>
    block.sub_statuses.map((s) => ({
      value: s.id,
      label: `${RETURN_PANEL_GROUP_LABELS[block.main_group]}: ${s.name}`,
      keywords: s.name,
    })),
  );

  const renderField = (fieldId: string) => {
    switch (fieldId) {
      case "search":
        return (
          <FilterField key={fieldId} label="Szukaj">
            <input
              className={filterInputClass}
              value={draft.search}
              onChange={(e) => onChangeDraft({ search: e.target.value })}
              placeholder="RMZ, nr zamówienia, id, fragment adresu…"
            />
          </FilterField>
        );
      case "return_status":
        return (
          <FilterField key={fieldId} label="Status zwrotu (workflow)">
            <select
              className={filterSelectClass}
              value={draft.returnStatusId}
              onChange={(e) => onChangeDraft({ returnStatusId: e.target.value })}
            >
              <option value="">Wszystkie</option>
              {returnStatuses.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </FilterField>
        );
      case "panel_status_multi":
        return (
          <FilterField key={fieldId} label="Status panelu">
            <FilterMultiSelect
              value={draft.panelStatusIds}
              onChange={(ids) => onChangeDraft({ panelStatusIds: ids })}
              options={panelStatusOptions}
              placeholder="Wybierz statusy panelu"
              emptySummary="Wszystkie (zgodnie z lewą kolumną)"
              totalOptionCount={panelStatusOptions.length || undefined}
              maxListHeightClass="max-h-72"
            />
          </FilterField>
        );
      case "date_range":
        return (
          <FilterDateRange
            key={fieldId}
            label="Data utworzenia zwrotu"
            from={draft.dateFrom}
            to={draft.dateTo}
            onFromChange={(v) => onChangeDraft({ dateFrom: v })}
            onToChange={(v) => onChangeDraft({ dateTo: v })}
          />
        );
      case "order_number":
        return (
          <FilterField key={fieldId} label="Numer zamówienia">
            <input
              className={filterInputClass}
              value={draft.orderNumber}
              onChange={(e) => onChangeDraft({ orderNumber: e.target.value })}
              placeholder="Fragment numeru…"
            />
          </FilterField>
        );
      case "customer":
        return (
          <FilterField key={fieldId} label="Klient">
            <input
              className={filterInputClass}
              value={draft.customer}
              onChange={(e) => onChangeDraft({ customer: e.target.value })}
              placeholder="Imię, nazwisko, e-mail…"
            />
          </FilterField>
        );
      case "warehouse":
        return (
          <FilterField key={fieldId} label="Magazyn">
            <select
              className={filterSelectClass}
              value={draft.listWarehouseId ?? ""}
              onChange={(e) =>
                onChangeDraft({
                  listWarehouseId: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            >
              <option value="">Jak w nagłówku</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </FilterField>
        );
      case "courier":
        return (
          <FilterField key={fieldId} label="Kurier / metoda dostawy">
            <FilterShippingMethodSelect
              value={draft.shippingMethodId}
              onChange={(id) => onChangeDraft({ shippingMethodId: id })}
              methods={shippingMethods}
            />
          </FilterField>
        );
      case "has_panel_label":
        return (
          <FilterField key={fieldId} label="Etykieta panelu">
            <select
              className={filterSelectClass}
              value={draft.hasPanelLabel}
              onChange={(e) =>
                onChangeDraft({ hasPanelLabel: e.target.value as AppliedReturnListFilters["hasPanelLabel"] })
              }
            >
              <option value="">Wszystkie</option>
              <option value="yes">Z przypisaną etykietą</option>
              <option value="no">Bez etykiety</option>
            </select>
          </FilterField>
        );
      case "tracking":
        return (
          <FilterField key={fieldId} label="Numer śledzenia">
            <input
              className={filterInputClass}
              value={draft.tracking}
              onChange={(e) => onChangeDraft({ tracking: e.target.value })}
              placeholder="Fragment z metadanych zamówienia…"
            />
          </FilterField>
        );
      case "archive_scope":
        return (
          <FilterField key={fieldId} label="Archiwum">
            <select
              className={filterSelectClass}
              value={draft.archiveScope}
              onChange={(e) => onChangeDraft({ archiveScope: e.target.value as AppliedReturnListFilters["archiveScope"] })}
            >
              <option value="active">Tylko aktywne</option>
              <option value="archived">Tylko zarchiwizowane</option>
              <option value="all">Aktywne i zarchiwizowane</option>
            </select>
          </FilterField>
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
          />
          {expanded ? filterBody : null}
        </FilterPanel>
      )}
      <FilterVisibilityModal
        open={visibilityOpen}
        onClose={() => setVisibilityOpen(false)}
        title="Widoczne pola — zwroty"
        selectedOrder={visibleFieldOrder}
        catalog={RETURN_LIST_FILTER_CATALOG}
        onSave={setOrderFromModal}
      />
    </>
  );
}
