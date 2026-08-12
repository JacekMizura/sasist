import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Factory,
  History,
  Package,
  PackageCheck,
  Plus,
} from "lucide-react";

import {
  fetchProductionDashboard,
  type ProductionBatchSummaryRead,
  type ProductionDashboardRead,
} from "../../api/productionApi";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { AppEmptyState } from "../../components/app-shell";
import {
  Card,
  ListTile,
  MetricCard,
  PageHeader,
  SearchInput,
  SecondaryButton,
  StatusBadge,
  Toolbar,
  primaryButtonClassName,
  typography,
} from "@/design-system";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { ProductionDashboardBatchGrid } from "./components/ProductionDashboardBatchGrid";
import { productionPageStackClass, productionPageTitleClass } from "./productionLayoutTokens";
import { erpProductionPaths } from "./productionPaths";

const DEFAULT_TENANT = 1;
const SECTION_LIMIT = 5;

function productLabel(batch: ProductionBatchSummaryRead): string {
  return batch.product_labels?.slice(0, 2).join(", ") || "—";
}

function formatPlannedDate(raw?: string | null): string {
  if (!raw) return "—";
  const d = raw.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}.${m}.${y}`;
}

function plannedSortKey(raw?: string | null): number {
  if (!raw) return Number.POSITIVE_INFINITY;
  const t = Date.parse(raw.slice(0, 10));
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function matchesQuery(batch: ProductionBatchSummaryRead, q: string): boolean {
  if (!q) return true;
  const hay = `${batch.number} ${productLabel(batch)} ${batch.operator_name ?? ""}`.toLowerCase();
  return hay.includes(q);
}

type WorkSectionProps = {
  title: string;
  count: number;
  countTone?: "neutral" | "info" | "success" | "warning" | "danger";
  children: ReactNode;
};

function WorkSection({ title, count, countTone = "neutral", children }: WorkSectionProps) {
  return (
    <Card variant="section" density="comfortable" className="flex min-h-0 flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className={typography.h2}>{title}</h2>
        <StatusBadge tone={countTone} density="compact">
          {count}
        </StatusBadge>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </Card>
  );
}

function KpiIcon({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={`mb-1 inline-flex h-8 w-8 items-center justify-center rounded-lg ${className}`} aria-hidden>
      {children}
    </span>
  );
}

export default function ProductionDashboardPage() {
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const tenantId = DEFAULT_TENANT;
  const [data, setData] = useState<ProductionDashboardRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchProductionDashboard(tenantId, warehouseId));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const q = query.trim().toLowerCase();

  const ready = useMemo(
    () => (data?.ready_to_produce ?? []).filter((b) => matchesQuery(b, q)),
    [data?.ready_to_produce, q]
  );
  const blocked = useMemo(
    () => (data?.waiting_materials ?? []).filter((b) => matchesQuery(b, q)),
    [data?.waiting_materials, q]
  );
  const active = useMemo(
    () => (data?.active ?? data?.in_progress ?? []).filter((b) => matchesQuery(b, q)),
    [data?.active, data?.in_progress, q]
  );
  const awaitingPutaway = useMemo(
    () => (data?.awaiting_putaway ?? []).filter((b) => matchesQuery(b, q)),
    [data?.awaiting_putaway, q]
  );
  const recentlyCompleted = useMemo(
    () => (data?.recently_completed ?? []).filter((b) => matchesQuery(b, q)),
    [data?.recently_completed, q]
  );

  const upcomingCompletions = useMemo(() => {
    const pool = [...active, ...awaitingPutaway, ...ready];
    const seen = new Set<number>();
    const unique = pool.filter((b) => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });
    return unique
      .slice()
      .sort((a, b) => plannedSortKey(a.planned_date) - plannedSortKey(b.planned_date))
      .slice(0, 8);
  }, [active, awaitingPutaway, ready]);

  if (!hasActiveWarehouse || warehouseId == null) {
    return <ActiveWarehouseRequiredBanner hint="Zlecenia RW/PW i partie produkcyjne są tworzone w aktywnym magazynie." />;
  }

  const awaitingCount = data?.awaiting_putaway_batches ?? awaitingPutaway.length;
  const shortageCount = data?.batches_with_shortages ?? blocked.length;

  return (
    <div className={productionPageStackClass}>
      <PageHeader
        title={<h1 className={productionPageTitleClass}>Pulpit produkcji</h1>}
        actions={
          <Link to={erpProductionPaths.createOrder} className={primaryButtonClassName()}>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-4 w-4" aria-hidden />
              Nowe zlecenie produkcyjne
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
                placeholder="Szukaj partii, produktu, operatora…"
                className="w-full min-w-[16rem] max-w-md"
                aria-label="Filtruj pulpit produkcji"
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
        <p className="text-sm text-slate-500">Wczytywanie danych…</p>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              density="comfortable"
              className="min-w-0"
              label={
                <span className="flex flex-col gap-1">
                  <KpiIcon className="bg-slate-100 text-slate-600">
                    <ClipboardList className="h-4 w-4" />
                  </KpiIcon>
                  <span>Do produkcji</span>
                </span>
              }
              value={data.ready_to_produce?.length ?? ready.length}
              hint="zaplanowane / gotowe"
            />
            <MetricCard
              density="comfortable"
              className="min-w-0"
              label={
                <span className="flex flex-col gap-1">
                  <KpiIcon className="bg-sky-50 text-sky-600">
                    <Factory className="h-4 w-4" />
                  </KpiIcon>
                  <span>W produkcji</span>
                </span>
              }
              value={data.active_batches}
              hint="aktywne zlecenia"
            />
            <MetricCard
              density="comfortable"
              className="min-w-0"
              label={
                <span className="flex flex-col gap-1">
                  <KpiIcon className="bg-rose-50 text-rose-600">
                    <AlertTriangle className="h-4 w-4" />
                  </KpiIcon>
                  <span>Brak komponentów</span>
                </span>
              }
              value={shortageCount}
              hint="wymaga uzupełnienia"
            />
            <MetricCard
              density="comfortable"
              className="min-w-0"
              label={
                <span className="flex flex-col gap-1">
                  <KpiIcon className="bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                  </KpiIcon>
                  <span>Gotowe dzisiaj</span>
                </span>
              }
              value={awaitingCount}
              hint="do rozlokowania / pakowania"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <WorkSection title="Do rozlokowania" count={awaitingPutaway.length} countTone="warning">
              <ProductionDashboardBatchGrid
                batches={awaitingPutaway}
                emptyIcon={PackageCheck}
                emptyTitle="Brak partii do rozlokowania"
                emptyDescription="Po zakończeniu produkcji partie pojawią się tutaj."
                limit={SECTION_LIMIT}
                seeAllTo={erpProductionPaths.orders}
              />
            </WorkSection>

            <WorkSection title="W produkcji" count={active.length} countTone="info">
              <ProductionDashboardBatchGrid
                batches={active}
                emptyIcon={Factory}
                emptyTitle="Brak partii w realizacji"
                emptyDescription="Aktywne partie pojawią się tutaj."
                limit={SECTION_LIMIT}
                seeAllTo={erpProductionPaths.orders}
              />
            </WorkSection>

            <WorkSection title="Gotowe do WMS" count={ready.length} countTone="success">
              <ProductionDashboardBatchGrid
                batches={ready}
                emptyIcon={Package}
                emptyTitle="Brak partii gotowych"
                emptyDescription="Gdy materiały będą dostępne, partie pojawią się tutaj."
                limit={SECTION_LIMIT}
                seeAllTo={erpProductionPaths.orders}
              />
            </WorkSection>

            <WorkSection
              title="Partie wymagające uwagi"
              count={blocked.length}
              countTone={blocked.length > 0 ? "danger" : "neutral"}
            >
              <ProductionDashboardBatchGrid
                batches={blocked}
                plainEmpty
                emptyTitle="Brak partii wymagających uwagi"
                limit={SECTION_LIMIT}
                seeAllTo={`${erpProductionPaths.orders}?shortages=1`}
              />
            </WorkSection>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card variant="section" density="comfortable" className="flex flex-col gap-3">
              <Toolbar
                start={<h2 className={typography.h2}>Ostatnia aktywność</h2>}
                end={
                  recentlyCompleted.length > 0 ? (
                    <Link
                      to={erpProductionPaths.history}
                      className="text-sm font-semibold text-slate-600 hover:text-slate-900"
                    >
                      Pokaż wszystkie
                    </Link>
                  ) : null
                }
              />
              {recentlyCompleted.length === 0 ? (
                <AppEmptyState
                  icon={History}
                  title="Brak ostatniej aktywności"
                  description="Zamknięte partie pojawią się tutaj po zakończeniu produkcji."
                  density="inline"
                />
              ) : (
                <ul className="space-y-2">
                  {recentlyCompleted.slice(0, 6).map((b) => (
                    <li key={b.id}>
                      <Link to={erpProductionPaths.batch(b.id)} className="block">
                        <ListTile density="compact" className="transition hover:border-slate-300">
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-mono text-sm font-semibold text-slate-900">{b.number}</p>
                              <p className="truncate text-xs text-slate-500">{productLabel(b)}</p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                Zakończono · plan {formatPlannedDate(b.planned_date)}
                              </p>
                            </div>
                            <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
                          </div>
                        </ListTile>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {data.finished_today > 0 ? (
                <p className="text-xs text-slate-500">
                  Ukończone dziś: <span className="font-semibold text-slate-700">{data.finished_today}</span>
                </p>
              ) : null}
            </Card>

            <Card variant="section" density="comfortable" className="flex flex-col gap-3">
              <Toolbar start={<h2 className={typography.h2}>Najbliższe zakończenia</h2>} />
              {upcomingCompletions.length === 0 ? (
                <AppEmptyState
                  icon={Factory}
                  title="Brak zaplanowanych zakończeń"
                  description="Partie z datą planu zakończenia pojawią się na tej liście."
                  density="inline"
                />
              ) : (
                <ul className="space-y-2">
                  {upcomingCompletions.map((b) => {
                    const pct = Math.max(0, Math.min(100, b.progress_percent ?? 0));
                    return (
                      <li key={b.id}>
                        <Link to={erpProductionPaths.batch(b.id)} className="block">
                          <ListTile density="compact" className="transition hover:border-slate-300">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-mono text-sm font-semibold text-slate-900">{b.number}</p>
                                <p className="truncate text-xs text-slate-500">{productLabel(b)}</p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="tabular-nums text-xs font-medium text-slate-700">
                                  {formatPlannedDate(b.planned_date)}
                                </p>
                                <p className="tabular-nums text-xs text-slate-500">{pct}%</p>
                              </div>
                            </div>
                          </ListTile>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </>
      ) : (
        <p className="text-sm text-rose-600">Nie udało się wczytać pulpitu produkcji.</p>
      )}
        </div>
      </PageHeader>
    </div>
  );
}
