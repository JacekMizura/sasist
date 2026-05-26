import { useEffect, useState, type MutableRefObject } from "react";

import {
  FilterField,
  FilterGrid,
  FilterPanel,
  FilterPanelBodyWithActions,
  FilterToolbar,
  FilterVisibilityModal,
  ListFilterEmbeddedShell,
  filterInputClass,
  useFilterFieldOrder,
  type FilterFieldCatalogItem,
} from "../filters";
import { listSellasistFilterGridClass4 } from "../listPage/listSellasistTokens";

const STORAGE_KEY = "complaints.list.filters.v1";

const CATALOG: FilterFieldCatalogItem[] = [{ id: "search", label: "Szukaj" }];
const IDS = CATALOG.map((c) => c.id);

export type ComplaintListFiltersPanelProps = {
  expanded: boolean;
  onToggleExpanded: () => void;
  searchValue: string;
  onSearchChange: (v: string) => void;
  onApply: () => void;
  onClear: () => void;
  filterLayout?: "toolbar" | "embedded";
  openFilterFieldsRef?: MutableRefObject<(() => void) | null>;
};

export function ComplaintListFiltersPanel({
  expanded,
  onToggleExpanded,
  searchValue,
  onSearchChange,
  onApply,
  onClear,
  filterLayout = "toolbar",
  openFilterFieldsRef,
}: ComplaintListFiltersPanelProps) {
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const { order: visibleFieldOrder, setOrderFromModal } = useFilterFieldOrder(STORAGE_KEY, IDS);

  const embedded = filterLayout === "embedded";
  if (embedded) void onToggleExpanded;

  useEffect(() => {
    if (!openFilterFieldsRef) return;
    openFilterFieldsRef.current = () => setVisibilityOpen(true);
    return () => {
      openFilterFieldsRef.current = null;
    };
  }, [openFilterFieldsRef]);

  const orderedNodes = visibleFieldOrder
    .map((fieldId) =>
      fieldId === "search" ? (
        <FilterField key={fieldId} label="Szukaj">
          <input
            className={filterInputClass}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Szukaj: tytuł, numer…"
          />
        </FilterField>
      ) : null,
    )
    .filter(Boolean);

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
        title="Widoczne pola — reklamacje"
        selectedOrder={visibleFieldOrder}
        catalog={CATALOG}
        onSave={setOrderFromModal}
      />
    </>
  );
}
