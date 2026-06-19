import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import { useTranslation } from "../../../locales";
import type { OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import type { ShippingMethodDto } from "../../../api/shippingMethodsApi";
import { ORDERS_PANEL_GROUP_LABELS } from "../OrdersPanelStatusSidebar";
import type { AppliedOrderListFilters } from "./orderListFilterTypes";
import {
  FilterDateRange,
  FilterField,
  FilterGrid,
  FilterMultiSelect,
  FilterMutexFlagMultiSelect,
  type FilterMutexFlagOption,
  FilterNumberRange,
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
import { listSellasistFilterGridClass4 } from "../../listPage/listSellasistTokens";

/** Bumped: domyślnie kompaktowy zestaw pól (jak zwroty/reklamacje). */
const ORDER_LIST_FILTER_STORAGE_KEY = "orders.list.v5";

/** Domyślnie widoczne pola — reszta przez „Widoczne pola filtrów”. */
const ORDER_LIST_DEFAULT_VISIBLE_FIELDS = [
  "search",
  "payment_status",
  "shipping_method",
  "date_range",
] as const;

const ORDER_EXTRA_FLAG_OPTIONS: FilterMutexFlagOption[] = [
  { id: "paid", label: "Tylko opłacone", mutexWith: ["unpaid"] },
  { id: "unpaid", label: "Tylko nieopłacone", mutexWith: ["paid"] },
  { id: "with_doc", label: "Tylko z dokumentem", mutexWith: ["without_doc"] },
  { id: "without_doc", label: "Tylko bez dokumentu", mutexWith: ["with_doc"] },
  { id: "archived", label: "Pokaż archiwalne" },
  { id: "direct_sales", label: "Tylko sprzedaż bezpośrednia" },
  { id: "immediate", label: "Tylko natychmiastowe wydanie" },
];

function extraFlagIdsFromDraft(d: AppliedOrderListFilters): string[] {
  const o: string[] = [];
  if (d.paidOnly) o.push("paid");
  if (d.unpaidOnly) o.push("unpaid");
  if (d.withDocument) o.push("with_doc");
  if (d.withoutDocument) o.push("without_doc");
  if (d.includeArchived) o.push("archived");
  if (d.directSalesOnly) o.push("direct_sales");
  if (d.immediateFulfillmentOnly) o.push("immediate");
  return o;
}

function draftPatchFromExtraFlags(ids: string[]): Partial<AppliedOrderListFilters> {
  const s = new Set(ids);
  return {
    paidOnly: s.has("paid"),
    unpaidOnly: s.has("unpaid"),
    withDocument: s.has("with_doc"),
    withoutDocument: s.has("without_doc"),
    includeArchived: s.has("archived"),
    directSalesOnly: s.has("direct_sales"),
    immediateFulfillmentOnly: s.has("immediate"),
  };
}

const ORDER_LIST_FILTER_CATALOG: FilterFieldCatalogItem[] = [
  { id: "search", label: "Szukaj" },
  { id: "payment_status", label: "Status płatności" },
  { id: "shipping_method", label: "Metoda dostawy" },
  { id: "panel_status_multi", label: "Status panelu" },
  { id: "date_range", label: "Data zamówienia" },
  { id: "warehouse", label: "Magazyn realizacji" },
  { id: "source", label: "Źródło" },
  { id: "value_range", label: "Wartość zamówienia (PLN)" },
  { id: "order_type", label: "Typ zamówienia" },
  { id: "extra_filters", label: "Filtry dodatkowe" },
];

const ORDER_LIST_FILTER_IDS = ORDER_LIST_FILTER_CATALOG.map((c) => c.id);

export type OrderListFiltersPanelProps = {
  expanded: boolean;
  onToggleExpanded: () => void;
  draft: AppliedOrderListFilters;
  onChangeDraft: (patch: Partial<AppliedOrderListFilters>) => void;
  onApply: () => void;
  onClear: () => void;
  panelSummary: OrderUiStatusPanelSummary | null;
  warehouses: { id: number; name: string }[];
  shippingMethods: ShippingMethodDto[];
  /** Lista zamówień: filtry bez własnego paska — przełącznik w nagłówku strony. */
  filterLayout?: "toolbar" | "embedded";
  openFilterFieldsRef?: MutableRefObject<(() => void) | null>;
};

export function OrderListFiltersPanel({
  expanded,
  onToggleExpanded,
  draft,
  onChangeDraft,
  onApply,
  onClear,
  panelSummary,
  warehouses,
  shippingMethods,
  filterLayout = "toolbar",
  openFilterFieldsRef,
}: OrderListFiltersPanelProps) {
  const t = useTranslation();
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const { order: visibleFieldOrder, setOrderFromModal } = useFilterFieldOrder(
    ORDER_LIST_FILTER_STORAGE_KEY,
    ORDER_LIST_FILTER_IDS,
    ORDER_LIST_DEFAULT_VISIBLE_FIELDS,
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

  const panelMultiOptions = useMemo(
    () =>
      (panelSummary?.groups ?? []).flatMap((block) =>
        block.sub_statuses.map((s) => ({
          value: s.id,
          label: `${ORDERS_PANEL_GROUP_LABELS[block.main_group]}: ${s.name}`,
          keywords: s.name,
        })),
      ),
    [panelSummary],
  );

  const extraFlagValue = useMemo(() => extraFlagIdsFromDraft(draft), [draft]);

  const renderField = (fieldId: string) => {
    switch (fieldId) {
      case "search":
        return (
          <FilterField key={fieldId} label="Szukaj">
            <input
              className={filterInputClass}
              value={draft.search}
              onChange={(e) => onChangeDraft({ search: e.target.value })}
              placeholder="Nr zamówienia, klient, e-mail, telefon…"
            />
          </FilterField>
        );
      case "payment_status":
        return (
          <FilterField key={fieldId} label="Status płatności">
            <select
              className={filterSelectClass}
              value={draft.paidOnly ? "__paid__" : draft.unpaidOnly ? "__unpaid__" : draft.paymentStatus || ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__paid__") onChangeDraft({ paidOnly: true, unpaidOnly: false, paymentStatus: "" });
                else if (v === "__unpaid__") onChangeDraft({ paidOnly: false, unpaidOnly: true, paymentStatus: "" });
                else onChangeDraft({ paidOnly: false, unpaidOnly: false, paymentStatus: v });
              }}
            >
              <option value="">Wszystkie</option>
              <option value="__paid__">Tylko opłacone</option>
              <option value="__unpaid__">Tylko nieopłacone</option>
              <option value="oczekuje">Zawiera: oczekuje</option>
              <option value="zaksięgowana">Zawiera: zaksięgowana</option>
            </select>
          </FilterField>
        );
      case "shipping_method":
        return (
          <FilterField key={fieldId} label="Metoda dostawy">
            <FilterShippingMethodSelect
              value={draft.shippingMethodId}
              onChange={(id) => onChangeDraft({ shippingMethodId: id })}
              methods={shippingMethods}
            />
          </FilterField>
        );
      case "panel_status_multi":
        return (
          <FilterField key={fieldId} label="Status panelu">
            <FilterMultiSelect
              value={draft.panelStatusIds}
              onChange={(ids) => onChangeDraft({ panelStatusIds: ids })}
              options={panelMultiOptions}
              placeholder="Status panelu"
              emptySummary="Wszystkie (jak w lewej kolumnie)"
              totalOptionCount={panelMultiOptions.length || undefined}
              maxListHeightClass="max-h-60"
            />
          </FilterField>
        );
      case "date_range":
        return (
          <FilterDateRange
            key={fieldId}
            label="Data zamówienia"
            from={draft.dateFrom}
            to={draft.dateTo}
            onFromChange={(v) => onChangeDraft({ dateFrom: v })}
            onToChange={(v) => onChangeDraft({ dateTo: v })}
          />
        );
      case "warehouse":
        return (
          <FilterField key={fieldId} label="Magazyn realizacji">
            <select
              className={filterSelectClass}
              value={draft.warehouseIdOverride ?? ""}
              onChange={(e) =>
                onChangeDraft({
                  warehouseIdOverride: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            >
              <option value="">Wszystkie</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </FilterField>
        );
      case "source":
        return (
          <FilterField key={fieldId} label="Źródło">
            <input
              className={filterInputClass}
              value={draft.sourceContains}
              onChange={(e) => onChangeDraft({ sourceContains: e.target.value })}
              placeholder="np. Allegro, sklep"
            />
          </FilterField>
        );
      case "value_range":
        return (
          <FilterNumberRange
            key={fieldId}
            label="Wartość zamówienia (PLN)"
            min={draft.valueMin}
            max={draft.valueMax}
            onMinChange={(v) => onChangeDraft({ valueMin: v })}
            onMaxChange={(v) => onChangeDraft({ valueMax: v })}
          />
        );
      case "order_type":
        return (
          <FilterField key={fieldId} label="Typ zamówienia">
            <select
              className={filterSelectClass}
              value={draft.orderType}
              onChange={(e) => onChangeDraft({ orderType: e.target.value })}
            >
              <option value="">Wszystkie</option>
              <option value="single">{t.orderTypeSingle}</option>
              <option value="multi">{t.orderTypeMulti}</option>
            </select>
          </FilterField>
        );
      case "extra_filters":
        return (
          <FilterField key={fieldId} label="Filtry dodatkowe">
            <FilterMutexFlagMultiSelect
              value={extraFlagValue}
              onChange={(ids) => onChangeDraft(draftPatchFromExtraFlags(ids))}
              options={ORDER_EXTRA_FLAG_OPTIONS}
              emptySummary="Brak"
            />
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
        title="Widoczne pola — zamówienia"
        selectedOrder={visibleFieldOrder}
        catalog={ORDER_LIST_FILTER_CATALOG}
        onSave={setOrderFromModal}
      />
    </>
  );
}
