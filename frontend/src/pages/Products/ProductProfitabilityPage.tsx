import { useEffect, useMemo, useState } from "react";
import { AlertOctagon, Banknote, ChevronDown, Package, Percent, TableProperties, TrendingDown, TrendingUp } from "lucide-react";

import { fetchProductProfitability, type ProductProfitabilityRow } from "../../api/productProfitabilityApi";
import { FilterVisibilityModal, useListColumnLayout } from "../../components/filters";
import { ListPageHeader } from "../../components/listPage/ListPageHeader";
import {
  moduleTableCardClass,
  moduleTablePaginationFooterClass,
} from "../../components/listPage/moduleList";
import {
  listSellasistInputClass,
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../../components/listPage/listSellasistTokens";
import PageLayout from "../../components/layout/PageLayout";
import {
  PRODUCT_PROFITABILITY_COLUMN_CATALOG,
  PRODUCT_PROFITABILITY_COLUMN_IDS,
  PRODUCT_PROFITABILITY_DEFAULT_COLUMN_ORDER,
  PRODUCT_PROFITABILITY_COLUMNS_LAYOUT_KEY,
} from "../../components/productProfitability/productProfitabilityColumnCatalog";
import { ProductProfitabilityFiltersPanel } from "../../components/productProfitability/ProductProfitabilityFiltersPanel";
import { ProductProfitabilityListTable } from "../../components/productProfitability/ProductProfitabilityListTable";
import {
  countActiveProductProfitabilityFilters,
  productProfitabilityFilterToggleLabel,
} from "../../components/productProfitability/productProfitabilityFilterTypes";
import {
  buildProductProfitabilityListViewAdapter,
  listViewActionsFromHook,
  useListViewState,
} from "../../preferences/listView";
import { DEFAULT_PAGE_SIZE_OPTIONS } from "../../components/table/DataTablePageSizeSelect";
import { PurchasingKpiCard, PurchasingKpiGrid } from "../../modules/purchasing/ui";

const ROWS_PER_PAGE_OPTIONS = DEFAULT_PAGE_SIZE_OPTIONS;

function money(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} PLN`;
}

function qty(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}

function pct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} %`;
}

function ProfitabilityDetailDrawer({
  row,
  onClose,
}: {
  row: ProductProfitabilityRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]">
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl md:rounded-l-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Szczegóły rentowności</h3>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            Zamknij
          </button>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">
              {row.sku ?? "—"} / {row.ean ?? "—"}
            </p>
            <p className="text-base font-semibold text-slate-800">{row.product_name}</p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Struktura kosztów</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                Koszt zakupu: <b>{money(row.purchase_price)}</b>
              </div>
              <div>
                Pakowanie: <b>{money(row.extra_cost_net)}</b>
              </div>
              <div>
                Całkowity koszt netto: <b>{money(row.landed_cost_net)}</b>
              </div>
              <div>
                Cena sprzedaży brutto: <b>{money(row.sale_gross)}</b>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sprzedaż</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                Sprzedana ilość: <b>{qty(row.sold_qty)}</b>
              </div>
              <div>
                Przychód netto: <b>{money(row.revenue_net)}</b>
              </div>
              <div>
                Zysk: <b>{money(row.profit_value)}</b>
              </div>
              <div>
                Marża: <b>{pct(row.margin_percent)}</b>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Magazyn</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                Stan: <b>{qty(row.stock_qty)}</b>
              </div>
              <div>
                Zamrożony kapitał: <b>{money(row.frozen_capital)}</b>
              </div>
            </div>
          </div>

          {row.recommendations.length > 0 ? (
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Rekomendacje</p>
              <div className="flex flex-wrap gap-2">
                {row.recommendations.map((r) => (
                  <span
                    key={r}
                    className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ProductProfitabilityPage() {
  const tenantId = useMemo(() => {
    const tid = new URLSearchParams(window.location.search).get("tenant_id");
    const parsed = Number(tid);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, []);

  const listViewAdapter = useMemo(() => buildProductProfitabilityListViewAdapter(tenantId), [tenantId]);
  const listView = useListViewState(listViewAdapter);
  const listViewActions = useMemo(() => listViewActionsFromHook(listView), [listView]);
  const {
    isHydrated,
    draftFilters,
    setDraftFilters,
    appliedFilters,
    applyFilters,
    clearFilters,
    appliedFiltersKey,
    page,
    setPage,
    pageSize,
    setPageSize,
    filtersExpanded,
    toggleFiltersPanel,
    columnOrder: listViewColumnOrder,
    persistColumnOrder: listViewPersistColumnOrder,
  } = listView;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchProductProfitability>> | null>(null);
  const [active, setActive] = useState<ProductProfitabilityRow | null>(null);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const { columnOrder, persistColumnOrder } = useListColumnLayout(
    PRODUCT_PROFITABILITY_COLUMNS_LAYOUT_KEY,
    PRODUCT_PROFITABILITY_COLUMN_IDS,
    PRODUCT_PROFITABILITY_DEFAULT_COLUMN_ORDER,
    { order: listViewColumnOrder, onChange: listViewPersistColumnOrder },
  );

  const activeFilterCount = useMemo(
    () => countActiveProductProfitabilityFilters(appliedFilters),
    [appliedFilters],
  );

  useEffect(() => {
    if (!isHydrated) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchProductProfitability({
          tenant_id: tenantId,
          range_days: appliedFilters.rangeDays,
          page,
          page_size: pageSize,
          sort: appliedFilters.sort,
          only_loss: appliedFilters.onlyLoss,
          only_low_margin: appliedFilters.onlyLowMargin,
          only_no_sales: appliedFilters.onlyNoSales,
          only_top_profit: appliedFilters.onlyTopProfit,
          only_high_stock: appliedFilters.onlyHighStock,
        });
        if (!cancelled) setData(res);
      } catch (e: unknown) {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : "Błąd ładowania rentowności");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, appliedFiltersKey, page, pageSize, isHydrated]);

  const toggleFiltersExpanded = toggleFiltersPanel;

  const rows = data?.rows ?? [];
  const totalCount = data?.pagination.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const startRow = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, totalCount);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 1) return [1];
    const max = 5;
    if (totalPages <= max) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (page <= 3) return [1, 2, 3, 4, 5];
    if (page >= totalPages - 2) return Array.from({ length: 5 }, (_, i) => totalPages - 4 + i);
    return [page - 2, page - 1, page, page + 1, page + 2];
  }, [page, totalPages]);

  const summary = data?.summary;

  return (
    <>
      <PageLayout fullBleed>
        <ListPageHeader
          title={`Rentowność produktów${loading ? "" : ` (${totalCount} wyników)`}`}
          description="Marże, koszty i zamrożony kapitał w magazynie w wybranym zakresie czasu."
          breadcrumbs={[
            { label: "Asortyment", to: "/products/list" },
            { label: "Produkty", to: "/products/list" },
            { label: "Rentowność produktów" },
          ]}
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={toggleFiltersExpanded}
                className={listSellasistToolbarToggleBtn}
                aria-expanded={filtersExpanded}
              >
                {filtersExpanded ? "Ukryj filtry" : productProfitabilityFilterToggleLabel(activeFilterCount)}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              <button
                type="button"
                onClick={() => setColumnPickerOpen(true)}
                className={listSellasistToolbarSquareBtn}
                title="Widoczne kolumny"
                aria-label="Widoczne kolumny"
              >
                <TableProperties className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              </button>
            </div>
          }
        />

        <div className="mb-6">
          <PurchasingKpiGrid columns={6}>
            <PurchasingKpiCard
              title="Przychód netto"
              value={loading ? "—" : money(summary?.revenue_net)}
              subtitle="Suma przychodu netto w wybranym okresie"
              tone="blue"
              icon={<Banknote aria-hidden />}
            />
            <PurchasingKpiCard
              title="Zysk"
              value={loading ? "—" : money(summary?.profit_gross)}
              subtitle="Zysk brutto w wybranym okresie"
              tone="emerald"
              icon={<TrendingUp aria-hidden />}
            />
            <PurchasingKpiCard
              title="Średnia marża"
              value={loading ? "—" : pct(summary?.avg_margin_percent)}
              subtitle="Średnia marża produktów w okresie"
              tone="indigo"
              icon={<Percent aria-hidden />}
            />
            <PurchasingKpiCard
              title="Produkty ze stratą"
              value={loading ? "—" : String(summary?.loss_products ?? 0)}
              subtitle="Produkty z ujemnym wynikiem"
              tone="red"
              icon={<TrendingDown aria-hidden />}
            />
            <PurchasingKpiCard
              title="Zamrożony kapitał"
              value={loading ? "—" : money(summary?.frozen_capital)}
              subtitle="Wartość kapitału w magazynie"
              tone="amber"
              icon={<Package aria-hidden />}
            />
            <PurchasingKpiCard
              title="Niska marża (<10%)"
              value={loading ? "—" : String(summary?.low_margin_products ?? 0)}
              subtitle="Produkty poniżej progu marży"
              tone="yellow"
              icon={<AlertOctagon aria-hidden />}
            />
          </PurchasingKpiGrid>
        </div>

        <ProductProfitabilityFiltersPanel
          expanded={filtersExpanded}
          draft={draftFilters}
          onChangeDraft={(patch) => setDraftFilters((d) => ({ ...d, ...patch }))}
          onApply={applyFilters}
          onClear={clearFilters}
          listView={listViewActions}
        />

        <div className={`${moduleTableCardClass} min-w-0`}>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <ProductProfitabilityListTable
              rows={rows}
              columnOrder={columnOrder}
              loading={loading}
              error={error}
              onRowOpen={setActive}
              formatMoney={money}
              formatQty={qty}
              formatPct={pct}
            />
            <div className={`${moduleTablePaginationFooterClass} px-4`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium tabular-nums text-slate-600">
                  {startRow}–{endRow} z {totalCount}
                </span>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  Na stronę
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className={`${listSellasistInputClass} !h-8 w-auto min-w-[4rem] py-0 pr-7 text-sm`}
                  >
                    {ROWS_PER_PAGE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
                >
                  Poprzednia
                </button>
                {pageNumbers.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={`min-w-[2rem] rounded-md px-1.5 py-1 text-sm font-semibold tabular-nums ${
                      n === page ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-200/60"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
                >
                  Następna
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                  className="ml-0.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
                >
                  Ostatnia
                </button>
              </div>
            </div>
          </div>
        </div>
      </PageLayout>

      <FilterVisibilityModal
        open={columnPickerOpen}
        onClose={() => setColumnPickerOpen(false)}
        title="Kolumny rentowności produktów"
        selectedColumnLabel="Widoczne"
        availableColumnLabel="Dostępne"
        selectedOrder={columnOrder}
        catalog={PRODUCT_PROFITABILITY_COLUMN_CATALOG}
        defaultVisibleOrder={PRODUCT_PROFITABILITY_DEFAULT_COLUMN_ORDER}
        onSave={persistColumnOrder}
      />

      {active ? <ProfitabilityDetailDrawer row={active} onClose={() => setActive(null)} /> : null}
    </>
  );
}
