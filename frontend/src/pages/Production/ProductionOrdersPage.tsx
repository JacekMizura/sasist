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
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTheadClass,
  moduleTableCardClass,
} from "../../components/listPage/moduleList";
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
  resolveProductionPriority,
  type ProductionPriorityLevel,
} from "./productionUi";
import {
  getProductionOperationalState,
  shouldShowProductionOrderOnActiveList,
} from "./productionOperationalState";
import { erpProductionPaths, wmsProductionPaths } from "./productionPaths";
import { ProductionOrdersFiltersPanel } from "./components/ProductionOrdersFiltersPanel";
import { ProductionProgressCell } from "./components/ProductionProgressCell";
import { ProductionRowActionsMenu } from "./components/ProductionRowActionsMenu";
import { ProductionSourceTypeBadge } from "./components/ProductionSourceTypeBadge";
import { ProductThumb } from "./components/ProductThumb";
import {
  productionModuleListTdClass,
  productionModuleListThClass,
  productionPageStackClass,
  productionPageTitleClass,
} from "./productionLayoutTokens";
import {
  PageHeader,
  SearchInput,
  SecondaryButton,
  Select,
  StatusBadge,
  Toolbar,
  primaryButtonClassName,
  type StatusTone,
} from "@/design-system";

const DEFAULT_TENANT = 1;

const PRIORITY_DISPLAY: Record<ProductionPriorityLevel, string> = {
  low: "Niski",
  normal: "Średni",
  high: "Wysoki",
  critical: "Krytyczny",
};

const STEP_TONE_TEXT: Record<StatusTone, string> = {
  danger: "text-rose-800",
  warning: "text-amber-900",
  info: "text-sky-900",
  primary: "text-orange-900",
  success: "text-emerald-900",
  neutral: "text-slate-800",
};

function formatPlannedDateCell(raw: string): string {
  if (!raw || raw === "—") return "—";
  const d = raw.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return "—";
  return `${day}.${m}.${y}`;
}

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function OrderRegisterRow({
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
  const producedQty = isOrder ? row.producedQty : Math.round(((row.progressPercent || 0) / 100) * row.qty * 1000) / 1000;
  const plannedQty = row.qty;
  const isPrintMethod =
    isOrder && row.sourceType === "ORDERS" && row.productionExecutionMethod === "PRINT";

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
    sourceRequestedQuantityTotal: isOrder ? row.sourceRequestedQuantityTotal : undefined,
    sourceShortageQuantityTotal: isOrder ? row.sourceShortageQuantityTotal : undefined,
    sourceShortageCount: isOrder ? row.sourceShortageCount : undefined,
    sourceFulfilledOrderCount: isOrder ? row.sourceFulfilledOrderCount : undefined,
    sourceAwaitingPackingOrderCount: isOrder ? row.sourceAwaitingPackingOrderCount : undefined,
    shortageComponentHint: isOrder ? row.shortageComponentHint : undefined,
    shortagePrimaryMissingQty: isOrder ? row.shortagePrimaryMissingQty : undefined,
    shortageAdditionalCount: isOrder ? row.shortageAdditionalCount : undefined,
  });
  const next = state.primaryAction;
  const progress = state.progressMeaning;

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
    <tr
      className={`border-b border-slate-100 hover:bg-slate-50/80 ${selected ? "bg-orange-50/50" : ""}`}
      id={selected ? "production-order-highlight" : undefined}
    >
      <td className={`${productionModuleListTdClass} whitespace-nowrap`}>
        <button
          type="button"
          onClick={onOpen}
          className="font-mono text-xs font-semibold text-slate-800 hover:text-orange-700 hover:underline"
        >
          {row.number}
        </button>
      </td>
      <td className={productionModuleListTdClass}>
        <div className="flex min-w-0 max-w-[16rem] items-center gap-2 lg:max-w-[22rem]">
          {isOrder ? <ProductThumb imageUrl={row.productImageUrl} name={row.product} size="sm" /> : null}
          <span className="truncate text-sm font-medium text-slate-900" title={row.product}>
            {row.product}
          </span>
        </div>
      </td>
      <td className={`${productionModuleListTdClass} whitespace-nowrap`}>
        <ProductionSourceTypeBadge
          kind={row.kind === "batch" ? "batch" : "order"}
          sourceType={isOrder ? row.sourceType : null}
        />
      </td>
      <td className={productionModuleListTdClass}>
        <span className={`text-sm font-semibold leading-snug ${STEP_TONE_TEXT[state.tone]}`}>
          {state.businessLabel}
        </span>
        {isPrintMethod ? (
          <p className="mt-0.5 text-[11px] text-slate-500">
            {productionExecutionMethodLabel(row.productionExecutionMethod)}
          </p>
        ) : null}
      </td>
      <td className={`${productionModuleListTdClass} w-[9rem]`}>
        <ProductionProgressCell
          current={progress.current}
          total={progress.total}
          percent={progress.percent}
          displayLine={progress.displayLine}
        />
      </td>
      <td className={`${productionModuleListTdClass} whitespace-nowrap tabular-nums text-slate-700`}>
        {formatQty(plannedQty)} szt.
      </td>
      <td className={`${productionModuleListTdClass} whitespace-nowrap text-slate-600`}>
        <div>{formatPlannedDateCell(row.date)}</div>
        <div className="text-[11px] text-slate-500">Priorytet {PRIORITY_DISPLAY[level]}</div>
      </td>
      <td className={`${productionModuleListTdClass} text-right`}>
        <div className="inline-flex items-center justify-end gap-1.5">
          <button
            type="button"
            className={primaryButtonClassName(
              next.disabled ? "pointer-events-none opacity-50" : "",
              "compact",
            )}
            disabled={Boolean(next.disabled)}
            title={next.disabledReason}
            onClick={handlePrimary}
          >
            {next.label}
          </button>
          <ProductionRowActionsMenu
            align="end"
            ariaLabel={`Więcej akcji ${row.number}`}
            actions={menuActions}
          />
        </div>
      </td>
    </tr>
  );
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
    [draftFilters, setAppliedFilters, setDraftFilters],
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
                <Link
                  to={erpProductionPaths.createOrder}
                  className="text-sm font-semibold text-slate-700 hover:underline"
                >
                  Przejdź do tworzenia zlecenia
                </Link>
              }
            />
          ) : (
            <div className={moduleTableCardClass}>
              <div className={`${moduleListTableScrollClass} overflow-x-auto`}>
                <table className={`${moduleListTableClass} min-w-0 w-full table-fixed lg:table-auto`}>
                  <thead className={moduleListTheadClass}>
                    <tr>
                      <th className={`${productionModuleListThClass} w-[8.5rem]`}>Numer</th>
                      <th className={productionModuleListThClass}>Produkt</th>
                      <th className={`${productionModuleListThClass} w-[6.5rem]`}>Typ</th>
                      <th className={`${productionModuleListThClass} w-[11rem]`}>Status</th>
                      <th className={`${productionModuleListThClass} w-[9.5rem]`}>Postęp</th>
                      <th className={`${productionModuleListThClass} w-[5.5rem]`}>Ilość</th>
                      <th className={`${productionModuleListThClass} w-[7rem]`}>Termin</th>
                      <th className={`${productionModuleListThClass} w-[12rem] text-right`}>Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const key = `${r.kind}-${r.id}`;
                      return (
                        <OrderRegisterRow
                          key={key}
                          row={r}
                          selected={highlightKey === key}
                          onOpen={() =>
                            navigate(
                              r.kind === "batch"
                                ? erpProductionPaths.batch(r.id)
                                : erpProductionPaths.order(r.id),
                            )
                          }
                          onNavigate={(to) => navigate(to)}
                          onReleaseToWms={() => void releaseToWms(r)}
                          onPrintOrder={
                            r.kind === "order" && warehouseId != null
                              ? () => {
                                  void printOrderProductionCardBrowser(tenantId, r.id, warehouseId).catch(
                                    () => {
                                      toast.error("Nie udało się wygenerować PDF zlecenia.");
                                    },
                                  );
                                }
                              : undefined
                          }
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </PageHeader>
    </div>
  );
}
