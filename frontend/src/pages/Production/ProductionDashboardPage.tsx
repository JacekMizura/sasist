import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, MapPin, Package, Plus } from "lucide-react";

import {
  fetchProductionDashboard,
  listProductionOrders,
  type ProductionBatchSummaryRead,
  type ProductionDashboardRead,
  type ProductionOrderRead,
} from "../../api/productionApi";
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
import { productionPageStackClass, productionPageTitleClass } from "./productionLayoutTokens";
import { erpProductionPaths } from "./productionPaths";
import { getProductionOperationalState, shortageHintFromOrderLines } from "./productionOperationalState";

const DEFAULT_TENANT = 1;
const SECTION_LIMIT = 8;

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
      density={emphasize ? "comfortable" : "compact"}
      className={`flex min-h-0 flex-col gap-2 ${
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
        {subtitle && count > 0 ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </Card>
  );
}

export default function ProductionDashboardPage() {
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const tenantId = DEFAULT_TENANT;
  const [data, setData] = useState<ProductionDashboardRead | null>(null);
  const [orders, setOrders] = useState<ProductionOrderRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, orderList] = await Promise.all([
        fetchProductionDashboard(tenantId, warehouseId),
        warehouseId != null
          ? listProductionOrders(tenantId, { warehouse_id: warehouseId })
          : Promise.resolve([] as ProductionOrderRead[]),
      ]);
      setData(dash);
      setOrders(orderList);
    } catch {
      setData(null);
      setOrders([]);
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

    // ORDERS + MANUAL/PLANNING MO — pełniejszy obraz niż same partie z pulpitu API
    const orderItems = orders
      .filter((o) => o.status !== "cancelled")
      .map(orderToWorkItem)
      .filter((item) => item.state.dashboardBucket !== "hidden" && item.state.dashboardBucket !== "done");

    // Unikalność: partie i zlecenia to osobne encje.
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

  if (!hasActiveWarehouse || warehouseId == null) {
    return <ActiveWarehouseRequiredBanner hint="Zlecenia RW/PW i partie produkcyjne są tworzone w aktywnym magazynie." />;
  }

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
                placeholder="Szukaj zlecenia, produktu…"
                className="w-full min-w-[16rem] max-w-md"
                aria-label="Filtruj kolejkę pracy"
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
          {loading ? (
            <p className="text-sm text-slate-500">Wczytywanie kolejki…</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Kolejka pracy: każda pozycja ma dokładnie jeden aktualny etap. Kliknij, aby wykonać następną akcję.
              </p>

              <WorkSection
                title="Wymaga reakcji"
                subtitle="Braki materiałów, blokady i opóźnienia."
                count={reaction.length}
                countTone={reaction.length > 0 ? "danger" : "neutral"}
                emphasize={reaction.length > 0}
              >
                <ProductionWorkQueueSection
                  items={reaction}
                  emptyTitle="Nic nie wymaga reakcji"
                  compactEmpty
                  limit={SECTION_LIMIT}
                  seeAllTo={reaction.length > 0 ? `${erpProductionPaths.orders}?shortages=1` : undefined}
                />
              </WorkSection>

              <WorkSection
                title="Do wykonania"
                subtitle="Praca czekająca na start lub kolejny etap."
                count={todo.length}
                countTone={todo.length > 0 ? "warning" : "neutral"}
              >
                {todo.length === 0 ? (
                  <p className="py-1 text-sm text-slate-500">Brak pozycji do wykonania</p>
                ) : (
                  <div className="space-y-4">
                    {todoByStep.start.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Wyślij do realizacji
                        </p>
                        <ProductionWorkQueueSection items={todoByStep.start} limit={SECTION_LIMIT} />
                      </div>
                    ) : null}
                    {todoByStep.collect.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Pobierz komponenty
                        </p>
                        <ProductionWorkQueueSection items={todoByStep.collect} limit={SECTION_LIMIT} />
                      </div>
                    ) : null}
                    {todoByStep.putaway.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Rozlokuj
                        </p>
                        <ProductionWorkQueueSection items={todoByStep.putaway} limit={SECTION_LIMIT} />
                      </div>
                    ) : null}
                    {todoByStep.pack.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Gotowe do pakowania
                        </p>
                        <ProductionWorkQueueSection items={todoByStep.pack} limit={SECTION_LIMIT} />
                      </div>
                    ) : null}
                  </div>
                )}
              </WorkSection>

              <WorkSection
                title="W toku"
                subtitle="Operacje już rozpoczęte."
                count={inProgress.length}
                countTone="info"
              >
                <ProductionWorkQueueSection
                  items={inProgress}
                  emptyTitle="Brak pracy w toku"
                  compactEmpty
                  limit={SECTION_LIMIT}
                  seeAllTo={inProgress.length > 0 ? erpProductionPaths.orders : undefined}
                />
              </WorkSection>

              <div className="flex flex-wrap gap-2 text-sm">
                <Link
                  to={erpProductionPaths.orders}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ClipboardList className="h-4 w-4" aria-hidden />
                  Wszystkie zlecenia
                </Link>
                <Link
                  to={erpProductionPaths.materialsShortages}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Package className="h-4 w-4" aria-hidden />
                  Materiały
                </Link>
                <Link
                  to={erpProductionPaths.planning}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"
                >
                  <MapPin className="h-4 w-4" aria-hidden />
                  Planowanie
                </Link>
              </div>
            </>
          )}
        </div>
      </PageHeader>
    </div>
  );
}
