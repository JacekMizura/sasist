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
  BATCH_STATUS_LABEL,
  PRODUCTION_STATUS_LABEL,
  executionStatusTone,
  materialReadinessLabel,
  materialReadinessTone,
  producibleQuantityHint,
  productionExecutionMethodLabel,
  productionProgressTone,
  productionSourceTypeLabel,
  productionSourceTypeTone,
  resolveMaterialReadiness,
  resolveProductionPriority,
  type ProductionPriorityLevel,
} from "./productionUi";
import { erpProductionPaths, wmsProductionPaths } from "./productionPaths";
import { ProductionOrdersFiltersPanel } from "./components/ProductionOrdersFiltersPanel";
import { ProductionRowActionsMenu } from "./components/ProductionRowActionsMenu";
import { ProductThumb } from "./components/ProductThumb";
import { productionPageStackClass, productionPageTitleClass } from "./productionLayoutTokens";
import {
  ListTile,
  PageHeader,
  ProgressBar,
  SearchInput,
  SecondaryButton,
  Select,
  StatusBadge,
  Toolbar,
  primaryButtonClassName,
  toneTextClass,
} from "@/design-system";

const DEFAULT_TENANT = 1;

const PRIORITY_DISPLAY: Record<ProductionPriorityLevel, string> = {
  low: "Niski",
  normal: "Średni",
  high: "Wysoki",
  critical: "Krytyczny",
};

function formatPlannedDate(raw: string): string {
  if (!raw || raw === "—") return "—";
  const d = raw.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}.${m}.${y}`;
}

function statusLabel(row: ProductionOrderRow): string {
  return row.kind === "batch"
    ? BATCH_STATUS_LABEL[row.status as keyof typeof BATCH_STATUS_LABEL] ?? row.status
    : PRODUCTION_STATUS_LABEL[row.status as keyof typeof PRODUCTION_STATUS_LABEL] ?? row.status;
}

function OrderWorkCard({
  row,
  selected,
  onOpen,
  onReleaseToWms,
  onPrintOrder,
}: {
  row: ProductionOrderRow;
  selected?: boolean;
  onOpen: () => void;
  onReleaseToWms: () => void;
  onPrintOrder?: () => void;
}) {
  const level = resolveProductionPriority(row.priority, row.hasShortages, row.numericPriority);
  const pct = row.progressPercent;
  const showProgress = typeof pct === "number" && Number.isFinite(pct);
  const clamped = showProgress ? Math.max(0, Math.min(100, pct)) : 0;
  const barTone = productionProgressTone(clamped, row.status);
  const isOrder = row.kind === "order";
  const producedQty = isOrder ? row.producedQty : 0;
  const plannedQty = row.qty;
  const isPrintMethod =
    isOrder && row.sourceType === "ORDERS" && row.productionExecutionMethod === "PRINT";
  const readiness = isOrder
    ? resolveMaterialReadiness({
        hasShortages: row.hasShortages,
        materialsReserved: row.materialsReserved,
        sourceShortageCount: row.sourceShortageCount,
        sourceReservedCount: row.sourceReservedCount,
        producedQuantity: row.producedQty,
        plannedQuantity: row.qty,
      })
    : row.hasShortages
      ? "shortage"
      : "unknown";
  const readyCount = isOrder ? row.sourceReservedCount ?? 0 : 0;
  const shortageCount = isOrder ? row.sourceShortageCount ?? 0 : 0;
  const sourceCount = isOrder ? row.sourceOrderCount ?? 0 : 0;
  const reservedQty = isOrder ? row.sourceReservedQuantityTotal ?? 0 : 0;
  const requestedQty = isOrder ? row.sourceRequestedQuantityTotal ?? 0 : 0;
  const qtyHint = producibleQuantityHint({
    sourceReservedQuantityTotal: reservedQty,
    sourceRequestedQuantityTotal: requestedQty,
    plannedQuantity: plannedQty,
    readiness,
  });
  const producedDenom =
    isOrder && row.sourceType === "ORDERS" && reservedQty > 0
      ? reservedQty
      : plannedQty;

  const wmsActions =
    !isPrintMethod && (row.status === "planned" || row.status === "draft")
      ? [
          {
            id: "wms",
            label: row.isReleasedToWms ? "Otwórz WMS" : "Wydaj do WMS",
            onClick: onReleaseToWms,
            disabled: row.hasShortages,
          },
        ]
      : [];

  const printActions =
    isPrintMethod && onPrintOrder
      ? [
          {
            id: "print-mo",
            label: "Wydrukuj zlecenie produkcyjne",
            onClick: onPrintOrder,
          },
        ]
      : [];

  return (
    <ListTile density="comfortable" selected={selected} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        {isOrder ? <ProductThumb imageUrl={row.productImageUrl} name={row.product} size="md" /> : null}
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="font-mono text-sm font-semibold text-slate-900">{row.number}</p>
              {isOrder && row.sourceType ? (
                <StatusBadge tone={productionSourceTypeTone(row.sourceType)} density="compact">
                  {productionSourceTypeLabel(row.sourceType)}
                </StatusBadge>
              ) : (
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">partia</span>
              )}
              {isOrder && (row.sourceType === "ORDERS" || row.productionExecutionMethod) ? (
                <StatusBadge tone="neutral" density="compact">
                  {productionExecutionMethodLabel(row.productionExecutionMethod)}
                </StatusBadge>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-900">{row.product}</p>
            <p className="mt-0.5 text-sm tabular-nums text-slate-700">
              <span className="font-semibold text-slate-900">
                {isOrder
                  ? `${formatQty(producedQty)} / ${formatQty(producedDenom)}`
                  : formatQty(plannedQty)}
              </span>{" "}
              <span className="text-slate-500">szt.</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={executionStatusTone(row.status)} density="compact">
              {statusLabel(row)}
            </StatusBadge>
            <StatusBadge tone={materialReadinessTone(readiness)} density="compact">
              {materialReadinessLabel(readiness, {
                producible: qtyHint?.producible,
                planned: qtyHint?.planned,
              })}
            </StatusBadge>
            <span className="text-xs text-slate-500">
              Priorytet: <span className="font-medium text-slate-700">{PRIORITY_DISPLAY[level]}</span>
            </span>
          </div>

          {isOrder && row.sourceType === "ORDERS" && sourceCount > 0 ? (
            <p className="text-xs text-slate-600">
              Zamówienia: <span className="font-semibold tabular-nums text-slate-900">{sourceCount}</span>
              {readyCount > 0 ? (
                <>
                  {" · "}
                  Gotowe do produkcji:{" "}
                  <span className="font-semibold tabular-nums text-slate-900">{readyCount}</span>
                </>
              ) : null}
              {shortageCount > 0 ? (
                <>
                  {" · "}
                  Brak komponentów:{" "}
                  <span className="font-semibold tabular-nums text-amber-800">{shortageCount}</span>
                </>
              ) : null}
              {requestedQty > 0 && Math.abs(requestedQty - producedDenom) > 1e-6 ? (
                <>
                  {" · "}
                  Plan: <span className="font-semibold tabular-nums text-slate-900">{formatQty(requestedQty)} szt.</span>
                </>
              ) : null}
            </p>
          ) : null}

          {showProgress ? (
            <div className="max-w-xl space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>Postęp</span>
                <span className={`tabular-nums font-semibold ${toneTextClass[barTone]}`}>{clamped}%</span>
              </div>
              <ProgressBar value={clamped} tone={barTone} />
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end sm:pt-1" onClick={(e) => e.stopPropagation()}>
          <ProductionRowActionsMenu
            align="end"
            ariaLabel={`Akcje ${row.number}`}
            actions={[
              { id: "open", label: "Otwórz", onClick: onOpen },
              { id: "edit", label: "Edytuj", onClick: onOpen },
              ...printActions,
              ...wmsActions,
            ]}
          />
        </div>
      </div>
    </ListTile>
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

  const reload = useCallback(async () => {
    if (warehouseId == null || !isHydrated) return;
    setLoading(true);
    try {
      const [b, o] = await Promise.all([
        listProductionBatches(tenantId, { warehouse_id: warehouseId }),
        listProductionOrders(tenantId, { warehouse_id: warehouseId }),
      ]);
      setBatches(b.filter((x) => x.status !== "completed" && x.status !== "cancelled"));
      setOrders(o.filter((x) => x.status !== "completed" && x.status !== "cancelled"));
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
    return filterProductionOrderRows(all, appliedFilters);
  }, [batches, orders, appliedFilters]);

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
        <ul className="flex w-full flex-col gap-3">
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
