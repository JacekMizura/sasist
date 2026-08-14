import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ClipboardList, Filter, Plus, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";

import { useWarehouse } from "../../context/WarehouseContext";
import {
  buildProductionOrdersListViewAdapter,
  listViewActionsFromHook,
  useListViewState,
} from "../../preferences/listView";
import {
  listProductionBatches,
  listProductionOrders,
  printOrderProductionCardBrowser,
  releaseBatchToWms,
  releaseOrderToWms,
  type ProductionBatchRead,
  type ProductionOrderRead,
} from "../../api/productionApi";
import { AppEmptyState } from "../../components/app-shell";
import {
  DEFAULT_PRODUCTION_ORDERS_FILTERS,
  PRODUCTION_ORDER_STATUS_OPTIONS,
  PRODUCTION_PRIORITY_OPTIONS,
  countActiveProductionOrdersFilters,
  filterProductionOrderRows,
  productionBatchToRow,
  productionOrderToRow,
  productionOrdersFilterLabel,
  type ProductionOrderRow,
  type ProductionOrdersListFilters,
} from "../../modules/production/productionListFilters";
import {
  productionExecutionMethodLabel,
  productionSourceBadgeLabel,
  productionSourceTypeLabel,
  resolveProductionPriority,
  type ProductionPriorityLevel,
} from "./productionUi";
import {
  getProductionOperationalState,
  productionOrdersSourceSummary,
  shouldShowProductionOrderOnActiveList,
} from "./productionOperationalState";
import { erpProductionPaths, wmsProductionPaths } from "./productionPaths";
import { ProductionOrdersFiltersPanel } from "./components/ProductionOrdersFiltersPanel";
import { ProductionOperatorTaskCard } from "./components/ProductionOperatorTaskCard";
import { ProductionRowActionsMenu } from "./components/ProductionRowActionsMenu";
import { productionPageStackClass, productionPageTitleClass } from "./productionLayoutTokens";
import {
  PageHeader,
  SearchInput,
  SecondaryButton,
  Select,
  StatusBadge,
  Toolbar,
  primaryButtonClassName,
} from "@/design-system";

const DEFAULT_TENANT = 1;

const PRIORITY_DISPLAY: Record<ProductionPriorityLevel, string> = {
  low: "Niski",
  normal: "Średni",
  high: "Wysoki",
  critical: "Krytyczny",
};

function formatPlannedDate(raw: string): string | null {
  if (!raw || raw === "—") return null;
  const d = raw.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return null;
  return `Termin ${day}.${m}.${y}`;
}

function OrderWorkCard({
  row,
  selected,
  onOpen,
  onReleaseToWms,
  onPrintOrder,
  onNavigate,
}: {
  row: ProductionOrderRow;
  selected?: boolean;
  onOpen: () => void;
  onReleaseToWms: () => void;
  onPrintOrder?: () => void;
  onNavigate: (to: string) => void;
}) {
  const level = resolveProductionPriority(row.priority, row.hasShortages, row.numericPriority);
  const isOrder = row.kind === "order";
  const producedQty = isOrder ? row.producedQty : 0;
  const plannedQty = row.qty;
  const isPrintMethod =
    isOrder && row.sourceType === "ORDERS" && row.productionExecutionMethod === "PRINT";
  const requestedQty = isOrder ? row.sourceRequestedQuantityTotal ?? 0 : 0;

  const state = getProductionOperationalState({
    executionKind: row.kind === "batch" ? "batch" : "order",
    id: row.id,
    status: row.status,
    sourceType: isOrder ? row.sourceType : "MANUAL",
    hasShortages: row.hasShortages,
    materialsReserved: isOrder ? row.materialsReserved : undefined,
    isReleasedToWms: row.isReleasedToWms,
    isPrintInterface: isOrder ? row.isPrintInterface : false,
    productionExecutionMethod: isOrder ? row.productionExecutionMethod : null,
    producedQuantity: producedQty,
    plannedQuantity: plannedQty,
    progressPercent: row.progressPercent,
    plannedDate: row.date !== "—" ? row.date : null,
    sourceOrderCount: isOrder ? row.sourceOrderCount : undefined,
    sourceRequestedQuantityTotal: requestedQty,
    sourceShortageQuantityTotal: isOrder ? row.sourceShortageQuantityTotal : undefined,
    sourceShortageCount: isOrder ? row.sourceShortageCount : undefined,
    sourceFulfilledOrderCount: isOrder ? row.sourceFulfilledOrderCount : undefined,
    sourceAwaitingPackingOrderCount: isOrder ? row.sourceAwaitingPackingOrderCount : undefined,
    shortageComponentHint: isOrder ? row.shortageComponentHint : undefined,
    shortagePrimaryMissingQty: isOrder ? row.shortagePrimaryMissingQty : undefined,
    shortageAdditionalCount: isOrder ? row.shortageAdditionalCount : undefined,
  });
  const next = state.primaryAction;

  const ordersSummary =
    isOrder && row.sourceType === "ORDERS"
      ? productionOrdersSourceSummary({
          sourceOrderCount: row.sourceOrderCount,
          sourceRequestedQuantityTotal: requestedQty,
          plannedQuantity: plannedQty,
        })
      : null;

  const secondaryBits = [
    isOrder && row.sourceType ? productionSourceTypeLabel(row.sourceType) : null,
    isPrintMethod ? productionExecutionMethodLabel(row.productionExecutionMethod) : null,
  ].filter(Boolean);
  const scheduleBits = [
    formatPlannedDate(row.date),
    `Priorytet ${PRIORITY_DISPLAY[level]}`,
  ].filter(Boolean);

  const handlePrimary = () => {
    if (next.kind === "send_to_execution") {
      onReleaseToWms();
      return;
    }
    if (next.kind === "start_print_execution") {
      onOpen();
      return;
    }
    if (next.href) {
      if (next.openInNewTab) {
        window.open(next.href, "_blank", "noopener,noreferrer");
      } else {
        onNavigate(next.href);
      }
      return;
    }
    onOpen();
  };

  const menuActions = [
    { id: "open", label: "Otwórz szczegóły", onClick: onOpen },
    ...(isPrintMethod && onPrintOrder
      ? [{ id: "print-mo", label: "Drukuj kartę", onClick: onPrintOrder }]
      : []),
  ];

  return (
    <ProductionOperatorTaskCard
      state={state}
      productLabel={row.product}
      productImageUrl={isOrder ? row.productImageUrl : null}
      qtyLabel={`${formatQty(plannedQty)} szt.`}
      productMeta={ordersSummary}
      documentNumber={row.number}
      sourceBadge={productionSourceBadgeLabel({
        kind: row.kind,
        sourceType: isOrder ? row.sourceType : null,
      })}
      secondaryMeta={secondaryBits.join(" · ") || null}
      scheduleMeta={scheduleBits.join(" · ")}
      selected={selected}
      compact
      showThumb={isOrder}
      onCtaClick={handlePrimary}
      ctaDisabled={Boolean(next.disabled)}
      ctaTitle={next.disabledReason}
      overflow={
        <ProductionRowActionsMenu
          align="end"
          ariaLabel={`Więcej akcji ${row.number}`}
          actions={menuActions}
        />
      }
    />
  );
}

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function ProductionOrdersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const listViewAdapter = useMemo(() => buildProductionOrdersListViewAdapter(tenantId), [tenantId]);
  const listView = useListViewState(listViewAdapter);
  const listViewActions = useMemo(() => listViewActionsFromHook(listView), [listView]);
  const {
    isHydrated,
    draftFilters,
    setDraftFilters,
    appliedFilters,
    applyFilters,
    clearFilters,
    filtersExpanded,
    toggleFiltersPanel,
    setExtension,
    setAppliedFilters,
  } = listView;
  const [batches, setBatches] = useState<ProductionBatchRead[]>([]);
  const [orders, setOrders] = useState<ProductionOrderRead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (warehouseId != null) setExtension("warehouseId", warehouseId);
  }, [setExtension, warehouseId]);

  useEffect(() => {
    if (!isHydrated) return;
    if (searchParams.get("shortages") === "1") {
      const next = { ...DEFAULT_PRODUCTION_ORDERS_FILTERS, shortagesOnly: true };
      setDraftFilters(next);
      setAppliedFilters(next);
    }
  }, [isHydrated, searchParams, setAppliedFilters, setDraftFilters]);

  const dashboardBucket = searchParams.get("bucket");

  const reload = useCallback(async () => {
    if (warehouseId == null || !isHydrated) return;
    setLoading(true);
    try {
      const [b, o] = await Promise.all([
        listProductionBatches(tenantId, { warehouse_id: warehouseId }),
        listProductionOrders(tenantId, { warehouse_id: warehouseId }),
      ]);
      setBatches(b.filter((x) => x.status !== "completed" && x.status !== "cancelled"));
      setOrders(o.filter(shouldShowProductionOrderOnActiveList));
    } catch {
      setBatches([]);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [isHydrated, tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo(() => {
    const all = [...batches.map(productionBatchToRow), ...orders.map(productionOrderToRow)];
    let filtered = filterProductionOrderRows(all, appliedFilters);
    if (dashboardBucket === "reaction" || dashboardBucket === "todo" || dashboardBucket === "in_progress") {
      filtered = filtered.filter((row) => {
        const isOrder = row.kind === "order";
        const state = getProductionOperationalState({
          executionKind: row.kind === "batch" ? "batch" : "order",
          id: row.id,
          status: row.status,
          sourceType: isOrder ? row.sourceType : "MANUAL",
          hasShortages: row.hasShortages,
          materialsReserved: isOrder ? row.materialsReserved : undefined,
          isReleasedToWms: row.isReleasedToWms,
          isPrintInterface: isOrder ? row.isPrintInterface : false,
          productionExecutionMethod: isOrder ? row.productionExecutionMethod : null,
          producedQuantity: isOrder ? row.producedQty : 0,
          plannedQuantity: row.qty,
          progressPercent: row.progressPercent,
          sourceOrderCount: isOrder ? row.sourceOrderCount : undefined,
          sourceRequestedQuantityTotal: isOrder ? row.sourceRequestedQuantityTotal : undefined,
          sourceShortageQuantityTotal: isOrder ? row.sourceShortageQuantityTotal : undefined,
          sourceShortageCount: isOrder ? row.sourceShortageCount : undefined,
          sourceFulfilledOrderCount: isOrder ? row.sourceFulfilledOrderCount : undefined,
          sourceAwaitingPackingOrderCount: isOrder ? row.sourceAwaitingPackingOrderCount : undefined,
          shortageComponentHint: isOrder ? row.shortageComponentHint : undefined,
          shortagePrimaryMissingQty: isOrder ? row.shortagePrimaryMissingQty : undefined,
          shortageAdditionalCount: isOrder ? row.shortageAdditionalCount : undefined,
        });
        return state.dashboardBucket === dashboardBucket;
      });
    }
    return filtered;
  }, [batches, orders, appliedFilters, dashboardBucket]);

  const activeFilterCount = countActiveProductionOrdersFilters(appliedFilters);
  const highlightKey = searchParams.get("highlight");

  const patchQuickFilters = useCallback(
    (patch: Partial<ProductionOrdersListFilters>) => {
      const next = { ...draftFilters, ...patch };
      setDraftFilters(next);
      setAppliedFilters(next);
    },
    [draftFilters, setAppliedFilters, setDraftFilters]
  );

  useEffect(() => {
    if (!highlightKey || loading) return;
    const el = document.getElementById("production-order-highlight");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightKey, loading, rows.length]);

  const releaseToWms = async (row: ProductionOrderRow) => {
    if (row.hasShortages) {
      toast.error("Nie można wydać do WMS — braki materiałów.");
      return;
    }
    if (row.isReleasedToWms) {
      toast.success(`${row.kind === "batch" ? "Partia" : "Zlecenie"} ${row.number} jest już w kolejce WMS.`);
      window.open(wmsProductionPaths.collecting(), "_blank", "noopener,noreferrer");
      return;
    }
    if (warehouseId == null) return;
    try {
      if (row.kind === "batch") {
        await releaseBatchToWms(tenantId, row.id, warehouseId);
        toast.success(`Partia ${row.number} wydana do terminalu WMS.`);
      } else {
        await releaseOrderToWms(tenantId, row.id, warehouseId);
        toast.success(`Zlecenie ${row.number} wydane do terminalu WMS.`);
      }
      await reload();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? "Wydanie nie powiodło się.")
          : e instanceof Error
            ? e.message
            : "Wydanie do WMS nie powiodło się.";
      toast.error(typeof msg === "string" ? msg : "Wydanie do WMS nie powiodło się.");
    }
  };

  if (warehouseId == null) {
    return <p className="py-8 text-sm text-slate-500">Wybierz magazyn, aby zarządzać zleceniami.</p>;
  }

  return (
    <div className={productionPageStackClass}>
      <PageHeader
        title={
          <h1 className={productionPageTitleClass}>
            Zlecenia produkcyjne
            {!loading ? (
              <span className="ml-2 text-base font-normal text-slate-500">{rows.length} wyników</span>
            ) : null}
          </h1>
        }
        status={
          <StatusBadge tone="neutral" density="comfortable">
            {productionOrdersFilterLabel(appliedFilters)}
          </StatusBadge>
        }
        actions={
          <Link to={erpProductionPaths.createOrder} className={primaryButtonClassName()}>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-4 w-4" aria-hidden />
              Utwórz zlecenie
            </span>
          </Link>
        }
        toolbar={
          <Toolbar
            start={
              <>
                <SearchInput
                  density="comfortable"
                  value={draftFilters.query}
                  onChange={(e) => patchQuickFilters({ query: e.target.value })}
                  placeholder="Szukaj numeru, produktu…"
                  className="w-full min-w-[12rem] max-w-xs"
                  aria-label="Szukaj zleceń"
                />
                <Select
                  density="comfortable"
                  value={draftFilters.status}
                  onChange={(e) => patchQuickFilters({ status: e.target.value })}
                  className="w-full min-w-[9rem] max-w-[11rem]"
                  aria-label="Status"
                >
                  {PRODUCTION_ORDER_STATUS_OPTIONS.map((o) => (
                    <option key={o.value || "all"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <Select
                  density="comfortable"
                  value={draftFilters.priority}
                  onChange={(e) => patchQuickFilters({ priority: e.target.value })}
                  className="w-full min-w-[8rem] max-w-[10rem]"
                  aria-label="Priorytet"
                >
                  {PRODUCTION_PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value || "all"} value={o.value}>
                      {o.value === "normal" ? "Średni" : o.label}
                    </option>
                  ))}
                </Select>
              </>
            }
            end={
              <>
                <SecondaryButton
                  type="button"
                  onClick={toggleFiltersPanel}
                  aria-expanded={filtersExpanded}
                  className="inline-flex items-center gap-1.5"
                >
                  <Filter className="h-4 w-4" aria-hidden />
                  Filtry
                  {activeFilterCount > 0 ? (
                    <StatusBadge tone="info" density="compact">
                      {activeFilterCount}
                    </StatusBadge>
                  ) : null}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </SecondaryButton>
                <SecondaryButton
                  type="button"
                  onClick={() => void reload()}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
                  Odśwież
                </SecondaryButton>
              </>
            }
          />
        }
      >
        <div className="space-y-4">
      <ProductionOrdersFiltersPanel
        expanded={filtersExpanded}
        draft={draftFilters}
        onChange={setDraftFilters}
        onApply={applyFilters}
        onClear={clearFilters}
        listView={listViewActions}
      />

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : rows.length === 0 ? (
        <AppEmptyState
          icon={ClipboardList}
          title="Brak zleceń do produkcji."
          description="Utwórz zlecenie ręcznie albo w planowaniu produkcji."
          action={
            <Link to={erpProductionPaths.createOrder} className="text-sm font-semibold text-slate-700 hover:underline">
              Przejdź do tworzenia zlecenia
            </Link>
          }
        />
      ) : (
        <ul className="flex w-full flex-col gap-1.5">
          {rows.map((r) => {
            const key = `${r.kind}-${r.id}`;
            const selected = highlightKey === key;
            return (
              <li key={key} className="w-full" id={selected ? "production-order-highlight" : undefined}>
                <OrderWorkCard
                  row={r}
                  selected={selected}
                  onOpen={() =>
                    navigate(r.kind === "batch" ? erpProductionPaths.batch(r.id) : erpProductionPaths.order(r.id))
                  }
                  onNavigate={(to) => navigate(to)}
                  onReleaseToWms={() => void releaseToWms(r)}
                  onPrintOrder={
                    r.kind === "order" && warehouseId != null
                      ? () => {
                          void printOrderProductionCardBrowser(tenantId, r.id, warehouseId).catch(() => {
                            toast.error("Nie udało się wygenerować PDF zlecenia.");
                          });
                        }
                      : undefined
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
        </div>
      </PageHeader>
    </div>
  );
}
