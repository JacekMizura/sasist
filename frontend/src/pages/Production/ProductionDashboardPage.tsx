import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ClipboardList, Factory, MapPin, Package, Plus } from "lucide-react";

import {
  fetchProductionDashboard,
  listProductionOrders,
  type ProductionBatchSummaryRead,
  type ProductionDashboardRead,
  type ProductionOrderRead,
} from "../../api/productionApi";
import {
  fetchProductionShortagesQueue,
  type ProductionShortageQueueRow,
} from "../../api/productionShortageApi";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import {
  Card,
  PageHeader,
  SearchInput,
  SecondaryButton,
  StatusBadge,
  Toolbar,
  primaryButtonClassName,
  typography,
} from "@/design-system";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { ProductionWorkQueueSection, type ProductionWorkItem } from "./components/ProductionWorkQueueSection";
import { ProductionKpiCard } from "./components/ProductionKpiCard";
import { ProductionKpiGrid } from "./components/ProductionKpiGrid";
import { productionPageStackClass, productionPageTitleClass } from "./productionLayoutTokens";
import { erpProductionPaths } from "./productionPaths";
import { getProductionOperationalState, shortageHintFromOrderLines } from "./productionOperationalState";
import {
  PRODUCTION_DASHBOARD_SECTION_LIMIT,
  countDueTodayFromPlannedDates,
  dashboardSeeAllHref,
} from "./productionDashboardHelpers";

const DEFAULT_TENANT = 1;
const SECTION_LIMIT = PRODUCTION_DASHBOARD_SECTION_LIMIT;
const CRITICAL_MATERIALS_LIMIT = 5;

function matchesQuery(item: ProductionWorkItem, q: string): boolean {
  if (!q) return true;
  const hay = `${item.number} ${item.productLabel} ${item.sourceLabel ?? ""}`.toLowerCase();
  return hay.includes(q);
}

function batchToWorkItem(b: ProductionBatchSummaryRead): ProductionWorkItem {
  const produced =
    b.total_planned_units > 0
      ? Math.round((b.progress_percent / 100) * b.total_planned_units * 1000) / 1000
      : 0;
  const state = getProductionOperationalState({
    executionKind: "batch",
    id: b.id,
    status: b.status,
    hasShortages: b.has_shortages,
    isReleasedToWms: b.is_released_to_wms,
    plannedQuantity: b.total_planned_units,
    producedQuantity: produced,
    plannedDate: b.planned_date,
  });
  return {
    key: `batch-${b.id}`,
    kind: "batch",
    id: b.id,
    number: b.number,
    productLabel: b.product_labels?.slice(0, 2).join(", ") || "—",
    productImageUrl: b.product_image_urls?.[0] ?? null,
    qtyLabel: `${b.total_planned_units} szt.`,
    plannedDate: b.planned_date,
    state,
  };
}

function orderToWorkItem(o: ProductionOrderRead): ProductionWorkItem {
  const shortage = shortageHintFromOrderLines(o.lines);
  const state = getProductionOperationalState({
    executionKind: "order",
    id: o.id,
    status: o.status,
    sourceType: o.source_type,
    hasShortages: o.has_shortages,
    materialsReserved: o.materials_reserved,
    isReleasedToWms: o.is_released_to_wms,
    isErpInterface: o.is_erp_interface,
    isPrintInterface: o.is_print_interface,
    productionExecutionMethod: o.production_execution_method,
    producedQuantity: o.produced_quantity,
    plannedQuantity: o.planned_quantity,
    collectionProgressPercent: o.collection_progress_percent,
    progressPercent: o.progress_percent,
    sourceOrderCount: o.source_order_count,
    sourceRequestedQuantityTotal: o.source_requested_quantity_total,
    sourceShortageQuantityTotal: o.source_shortage_quantity_total,
    sourceShortageCount: o.source_shortage_count,
    sourceFulfilledOrderCount: o.source_fulfilled_order_count,
    sourceAwaitingPackingOrderCount: o.source_awaiting_packing_order_count,
    shortageComponentHint: shortage.hint,
    shortagePrimaryMissingQty: shortage.primaryMissingQty || undefined,
    shortageAdditionalCount: shortage.additionalCount || undefined,
  });
  const sourceLabel =
    o.source_type === "ORDERS"
      ? "Na zamówienia"
      : o.source_type === "PLANNING"
        ? "Na magazyn"
        : o.source_type === "MANUAL"
          ? "Ręczne"
          : null;
  return {
    key: `order-${o.id}`,
    kind: "order",
    id: o.id,
    number: o.number,
    productLabel: o.product_name ?? `Produkt #${o.product_id}`,
    productImageUrl: o.product_image_url,
    qtyLabel: `${o.produced_quantity}/${o.planned_quantity} szt.`,
    sourceLabel,
    sourceType: o.source_type ?? null,
    plannedDate: null,
    state,
  };
}

type SectionProps = {
  title: string;
  subtitle?: string;
  count: number;
  countTone?: "neutral" | "info" | "success" | "warning" | "danger";
  emphasize?: boolean;
  children: ReactNode;
};

function WorkSection({
  title,
  subtitle,
  count,
  countTone = "neutral",
  emphasize = false,
  children,
}: SectionProps) {
  return (
    <Card
      variant="section"
      density="compact"
      className={`flex min-h-0 flex-col gap-1.5 ${
        emphasize ? "border-rose-200/80 bg-rose-50/30 ring-1 ring-rose-100" : ""
      }`}
    >
      <div className="min-w-0 space-y-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className={emphasize ? `${typography.h2} text-rose-950` : typography.h2}>{title}</h2>
          <StatusBadge tone={countTone} density="compact">
            {count}
          </StatusBadge>
        </div>
        {subtitle && count > 0 ? <p className="text-xs text-slate-600">{subtitle}</p> : null}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </Card>
  );
}

function formatMissingQty(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export default function ProductionDashboardPage() {
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const tenantId = DEFAULT_TENANT;
  const [data, setData] = useState<ProductionDashboardRead | null>(null);
  const [orders, setOrders] = useState<ProductionOrderRead[]>([]);
  const [shortages, setShortages] = useState<ProductionShortageQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, orderList, shortageList] = await Promise.all([
        fetchProductionDashboard(tenantId, warehouseId),
        warehouseId != null
          ? listProductionOrders(tenantId, { warehouse_id: warehouseId })
          : Promise.resolve([] as ProductionOrderRead[]),
        warehouseId != null
          ? fetchProductionShortagesQueue(tenantId, warehouseId).catch(() => [] as ProductionShortageQueueRow[])
          : Promise.resolve([] as ProductionShortageQueueRow[]),
      ]);
      setData(dash);
      setOrders(orderList);
      setShortages(shortageList);
    } catch {
      setData(null);
      setOrders([]);
      setShortages([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const q = query.trim().toLowerCase();

  const workItems = useMemo(() => {
    const fromBatches = [
      ...(data?.waiting_materials ?? []),
      ...(data?.ready_to_produce ?? []),
      ...(data?.in_progress ?? data?.active ?? []),
      ...(data?.awaiting_putaway ?? []),
    ];
    const seenBatch = new Set<number>();
    const batchItems: ProductionWorkItem[] = [];
    for (const b of fromBatches) {
      if (seenBatch.has(b.id)) continue;
      seenBatch.add(b.id);
      batchItems.push(batchToWorkItem(b));
    }

    const orderItems = orders
      .filter((o) => o.status !== "cancelled")
      .map(orderToWorkItem)
      .filter((item) => item.state.dashboardBucket !== "hidden" && item.state.dashboardBucket !== "done");

    return [...orderItems, ...batchItems]
      .filter((item) => item.state.dashboardBucket !== "done")
      .filter((item) => matchesQuery(item, q));
  }, [data, orders, q]);

  const reaction = useMemo(
    () => workItems.filter((i) => i.state.dashboardBucket === "reaction"),
    [workItems],
  );
  const todo = useMemo(
    () => workItems.filter((i) => i.state.dashboardBucket === "todo"),
    [workItems],
  );
  const inProgress = useMemo(
    () => workItems.filter((i) => i.state.dashboardBucket === "in_progress"),
    [workItems],
  );

  const todoByStep = useMemo(() => {
    const collect = todo.filter(
      (i) =>
        i.state.currentStep === "READY_TO_START" &&
        (i.state.primaryAction.kind === "start_collecting" ||
          i.state.businessLabel === "Pobierz komponenty"),
    );
    const start = todo.filter(
      (i) => i.state.currentStep === "READY_TO_START" && !collect.includes(i),
    );
    const putaway = todo.filter((i) => i.state.currentStep === "WAITING_PUTAWAY");
    const pack = todo.filter((i) => i.state.currentStep === "READY_TO_PACK");
    return { start, collect, putaway, pack };
  }, [todo]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const plannedDatesForKpi = useMemo(
    () => workItems.map((i) => i.plannedDate),
    [workItems],
  );
  const dueTodayCount = useMemo(
    () => countDueTodayFromPlannedDates(plannedDatesForKpi, todayIso),
    [plannedDatesForKpi, todayIso],
  );

  const criticalMaterials = useMemo(() => {
    return [...shortages]
      .filter((r) => Number(r.missing_qty) > 0)
      .sort((a, b) => Number(b.missing_qty) - Number(a.missing_qty))
      .slice(0, CRITICAL_MATERIALS_LIMIT);
  }, [shortages]);

  if (!hasActiveWarehouse || warehouseId == null) {
    return (
      <ActiveWarehouseRequiredBanner hint="Zlecenia RW/PW i partie produkcyjne są tworzone w aktywnym magazynie." />
    );
  }

  const shortagesKpi = data?.batches_with_shortages ?? 0;
  const inProductionKpi = data?.units_in_production ?? data?.active_batches ?? 0;
  const putawayKpi = data?.awaiting_putaway_batches ?? data?.putaway_batches ?? 0;
  const plannedKpi = data?.planned_batches ?? data?.waiting_batches ?? 0;
  const kpiValue = (n: number) => (loading ? "" : n);

  return (
    <div className={productionPageStackClass}>
      <PageHeader
        title={<h1 className={productionPageTitleClass}>Pulpit produkcji</h1>}
        actions={
          <Link to={erpProductionPaths.createOrder} className={primaryButtonClassName()}>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-4 w-4" aria-hidden />
              Nowe zlecenie
            </span>
          </Link>
        }
        toolbar={
          <Toolbar
            start={
              <SearchInput
                density="comfortable"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Szukaj w kolejce uwagi…"
                className="w-full min-w-[16rem] max-w-md"
                aria-label="Filtruj kolejkę uwagi"
              />
            }
            end={
              <SecondaryButton type="button" onClick={() => void reload()} disabled={loading}>
                Odśwież
              </SecondaryButton>
            }
          />
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Co wymaga działania teraz — pełny rejestr realizacji w{" "}
            <Link to={erpProductionPaths.orders} className="font-semibold text-orange-700 hover:underline">
              Zleceniach
            </Link>
            .
          </p>
          <ProductionKpiGrid columns={5}>
            <ProductionKpiCard
              title="Z brakami"
              value={kpiValue(shortagesKpi)}
              subtitle="Wymaga uwagi"
              tone={shortagesKpi > 0 ? "amber" : "emerald"}
              icon={<AlertTriangle aria-hidden />}
              to={erpProductionPaths.materialsShortages}
            />
            <ProductionKpiCard
              title="W produkcji"
              value={kpiValue(inProductionKpi)}
              subtitle="Aktywne zlecenia"
              tone="blue"
              icon={<Factory aria-hidden />}
            />
            <ProductionKpiCard
              title="Do rozlokowania"
              value={kpiValue(putawayKpi)}
              subtitle="Gotowe do rozlokowania"
              tone={putawayKpi > 0 ? "amber" : "default"}
              icon={<MapPin aria-hidden />}
            />
            <ProductionKpiCard
              title="Oczekujące / zaplanowane"
              value={kpiValue(plannedKpi)}
              subtitle="W kolejce"
              tone="indigo"
              icon={<ClipboardList aria-hidden />}
            />
            <ProductionKpiCard
              title="Do zrobienia dziś"
              value={kpiValue(dueTodayCount)}
              subtitle="Termin: dzisiaj"
              tone="blue"
              icon={<Package aria-hidden />}
            />
          </ProductionKpiGrid>

          {loading ? (
            <p className="text-sm text-slate-500">Wczytywanie kolejki…</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4">
              <WorkSection
                title="Wymaga reakcji"
                subtitle="Braki materiałów i blokady."
                count={reaction.length}
                countTone={reaction.length > 0 ? "danger" : "neutral"}
                emphasize={reaction.length > 0}
              >
                <ProductionWorkQueueSection
                  items={reaction}
                  emptyTitle="Nic nie wymaga reakcji"
                  compactEmpty
                  limit={SECTION_LIMIT}
                  seeAllLabel="Zobacz wszystkie"
                  seeAllTo={
                    reaction.length > 0
                      ? dashboardSeeAllHref(erpProductionPaths.orders, "reaction")
                      : undefined
                  }
                />
              </WorkSection>

              <WorkSection
                title="Do wykonania"
                subtitle="Start lub kolejny etap."
                count={todo.length}
                countTone={todo.length > 0 ? "warning" : "neutral"}
              >
                {todo.length === 0 ? (
                  <p className="py-0.5 text-sm text-slate-500">Brak pozycji do wykonania</p>
                ) : (
                  <ProductionWorkQueueSection
                    items={[
                      ...todoByStep.start,
                      ...todoByStep.collect,
                      ...todoByStep.putaway,
                      ...todoByStep.pack,
                    ]}
                    limit={SECTION_LIMIT}
                    seeAllLabel="Zobacz wszystkie"
                    seeAllTo={dashboardSeeAllHref(erpProductionPaths.orders, "todo")}
                  />
                )}
              </WorkSection>

              <WorkSection
                title="W toku"
                subtitle="Operacje już rozpoczęte."
                count={inProgress.length}
                countTone="info"
              >
                {inProgress.length === 0 ? (
                  <p className="py-0.5 text-sm text-slate-500">Brak pracy w toku</p>
                ) : (
                  <ProductionWorkQueueSection
                    items={inProgress}
                    limit={SECTION_LIMIT}
                    seeAllLabel="Zobacz wszystkie"
                    seeAllTo={dashboardSeeAllHref(erpProductionPaths.orders, "in_progress")}
                  />
                )}
              </WorkSection>

              <WorkSection
                title="Materiały krytyczne"
                subtitle="Największe braki komponentów."
                count={criticalMaterials.length}
                countTone={criticalMaterials.length > 0 ? "danger" : "neutral"}
                emphasize={criticalMaterials.length > 0}
              >
                {criticalMaterials.length === 0 ? (
                  <p className="py-0.5 text-sm text-slate-500">Brak krytycznych braków</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {criticalMaterials.map((row) => (
                      <li
                        key={row.component_product_id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {row.product_name}
                          </p>
                          {row.product_sku ? (
                            <p className="truncate text-[11px] text-slate-500">{row.product_sku}</p>
                          ) : null}
                        </div>
                        <StatusBadge tone="danger" density="compact">
                          Brakuje: {formatMissingQty(Number(row.missing_qty))} szt.
                        </StatusBadge>
                      </li>
                    ))}
                    <li className="pt-0.5 text-right">
                      <Link
                        to={erpProductionPaths.materialsShortages}
                        className="text-sm font-semibold text-slate-600 hover:text-slate-900"
                      >
                        Materiały ({shortages.length})
                      </Link>
                    </li>
                  </ul>
                )}
              </WorkSection>
            </div>
          )}
        </div>
      </PageHeader>
    </div>
  );
}
