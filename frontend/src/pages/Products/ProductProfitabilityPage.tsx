import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { fetchProductProfitability, type ProductProfitabilityRow } from "../../api/productProfitabilityApi";
import {
  FilterField,
  FilterGrid,
  filterCheckboxClass,
  filterSelectClass,
} from "../../components/filters";
import { ModuleListFiltersCard } from "../../components/listPage/ModuleListFiltersCard";
import { ListPageHeader } from "../../components/listPage/ListPageHeader";
import { DataTablePageSizeSelect, DEFAULT_PAGE_SIZE_OPTIONS } from "../../components/table/DataTablePageSizeSelect";
import {
  panelListDenseActionsOnlyCellClass,
  panelListDenseActionsOnlyHeaderClass,
  panelListDenseRowActionBtn,
  panelListDenseRowClass,
  panelListDenseTableClass,
  panelListDenseTableScrollWrapClass,
  panelListDenseTdBase,
  panelListDenseThBase,
  panelListDenseTheadClass,
} from "../../components/panelList/panelListDenseTableTokens";
import PageLayout from "../../components/layout/PageLayout";
import { useLocalStorage } from "../../hooks/useLocalStorage";

const RANGE_OPTIONS = [
  { value: 1, label: "Dzisiaj" },
  { value: 7, label: "7 dni" },
  { value: 30, label: "30 dni" },
  { value: 90, label: "90 dni" },
  { value: 365, label: "365 dni" },
] as const;

/** Stable reference for `useLocalStorage` (must match RANGE_OPTIONS values). */
const PROFITABILITY_RANGE_DAYS_ALLOWED = [1, 7, 30, 90, 365] as const;

const SORT_OPTIONS = [
  { value: "lowest_profit", label: "Najniższy zysk" },
  { value: "highest_profit", label: "Najwyższy zysk" },
  { value: "highest_revenue", label: "Najwyższy przychód" },
  { value: "highest_frozen_capital", label: "Najwyższy zamrożony kapitał" },
  { value: "worst_margin", label: "Najgorsza marża" },
  { value: "best_margin", label: "Najlepsza marża" },
] as const;

function money(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + " PLN";
}
function qty(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}
function pct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} %`;
}

function statusPill(status: ProductProfitabilityRow["status"]): { label: string; className: string } {
  switch (status) {
    case "loss":
      return { label: "Strata", className: "bg-rose-50 text-rose-900 ring-1 ring-rose-200" };
    case "low_margin":
      return { label: "Niska marża", className: "bg-amber-50 text-amber-950 ring-1 ring-amber-200" };
    case "premium":
      return { label: "Premium", className: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200" };
    case "dead_stock":
      return { label: "Martwy stock", className: "bg-slate-100 text-slate-700 ring-1 ring-slate-200" };
    default:
      return { label: "Zdrowy", className: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200" };
  }
}

export default function ProductProfitabilityPage() {
  const tenantId = useMemo(() => {
    const tid = new URLSearchParams(window.location.search).get("tenant_id");
    const parsed = Number(tid);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, []);
  const [rangeDays, setRangeDays] = useLocalStorage(
    "products.profitability.rangeDays",
    30,
    PROFITABILITY_RANGE_DAYS_ALLOWED,
  );
  const [sort, setSort] = useState<string>("lowest_profit");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useLocalStorage("products.profitability.pageSize", 25, DEFAULT_PAGE_SIZE_OPTIONS);

  const [onlyLoss, setOnlyLoss] = useState(false);
  const [onlyLowMargin, setOnlyLowMargin] = useState(false);
  const [onlyNoSales, setOnlyNoSales] = useState(false);
  const [onlyTopProfit, setOnlyTopProfit] = useState(false);
  const [onlyHighStock, setOnlyHighStock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchProductProfitability>> | null>(null);
  const [active, setActive] = useState<ProductProfitabilityRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchProductProfitability({
          tenant_id: tenantId,
          range_days: rangeDays,
          page,
          page_size: pageSize,
          sort,
          only_loss: onlyLoss,
          only_low_margin: onlyLowMargin,
          only_no_sales: onlyNoSales,
          only_top_profit: onlyTopProfit,
          only_high_stock: onlyHighStock,
        });
        if (!cancelled) setData(res);
      } catch (e: any) {
        if (!cancelled) {
          setData(null);
          setError(e?.message ?? "Błąd ładowania rentowności");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, rangeDays, page, pageSize, sort, onlyLoss, onlyLowMargin, onlyNoSales, onlyTopProfit, onlyHighStock]);

  const rows = data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.pagination.total ?? 0) / pageSize));
  const applyFilters = () => setPage(1);
  const clearFilters = () => {
    setRangeDays(30);
    setSort("lowest_profit");
    setOnlyLoss(false);
    setOnlyLowMargin(false);
    setOnlyNoSales(false);
    setOnlyTopProfit(false);
    setOnlyHighStock(false);
    setPage(1);
  };

  return (
    <>
      <PageLayout fullBleed cardClassName="rounded-2xl shadow-sm space-y-0">
            <ListPageHeader
              title="Rentowność produktów"
              description="Marże, koszty i kapitał zamrożony w magazynie w wybranym zakresie czasu."
              breadcrumbs={[
                { label: "Asortyment", to: "/products/list" },
                { label: "Produkty", to: "/products/list" },
                { label: "Rentowność produktów" },
              ]}
            />

            <div className="border-t border-slate-100 pt-6">
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6 items-stretch">
                <KpiCard label="Przychód netto" value={money(data?.summary.revenue_net)} />
                <KpiCard label="Zysk brutto PLN" value={money(data?.summary.profit_gross)} />
                <KpiCard label="Średnia marża %" value={pct(data?.summary.avg_margin_percent)} />
                <KpiCard label="Produkty ze stratą" value={String(data?.summary.loss_products ?? 0)} />
                <KpiCard label="Zamrożony kapitał" value={money(data?.summary.frozen_capital)} />
                <KpiCard label="Niska marża (<10%)" value={String(data?.summary.low_margin_products ?? 0)} />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
            <ModuleListFiltersCard
              onApply={applyFilters}
              onClear={clearFilters}
              clearLabel="Wyczyść"
              applyLabel="Filtruj"
              filterBodyClassName="space-y-4 border-t border-slate-100 pt-5"
            >
        <FilterGrid>
          <FilterField label="Zakres czasu">
            <select
              className={filterSelectClass}
              value={rangeDays}
              onChange={(e) => {
                setRangeDays(Number(e.target.value));
                setPage(1);
              }}
            >
              {RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Sortowanie">
            <select
              className={filterSelectClass}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FilterField>
        </FilterGrid>
        <div className="flex flex-wrap gap-x-4 gap-y-3 border-t border-slate-100 pt-4 text-sm text-slate-700">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className={filterCheckboxClass} checked={onlyLoss} onChange={(e) => setOnlyLoss(e.target.checked)} />
            tylko strata
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className={filterCheckboxClass} checked={onlyLowMargin} onChange={(e) => setOnlyLowMargin(e.target.checked)} />
            tylko niska marża
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className={filterCheckboxClass} checked={onlyNoSales} onChange={(e) => setOnlyNoSales(e.target.checked)} />
            tylko bez sprzedaży
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className={filterCheckboxClass} checked={onlyTopProfit} onChange={(e) => setOnlyTopProfit(e.target.checked)} />
            tylko top zysk
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className={filterCheckboxClass} checked={onlyHighStock} onChange={(e) => setOnlyHighStock(e.target.checked)} />
            tylko wysoki stan
          </label>
        </div>
            </ModuleListFiltersCard>
            </div>

            <div className="min-w-0 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 md:px-5">
              <p className="text-sm font-medium text-slate-700">
                {loading ? "Ładowanie…" : error ? "—" : `${data?.pagination.total ?? 0} rekordów`}
              </p>
              <DataTablePageSizeSelect
                value={pageSize}
                onChange={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
              />
            </div>
            <div className={panelListDenseTableScrollWrapClass}>
          <table className={`${panelListDenseTableClass} min-w-[1400px]`}>
            <thead className={panelListDenseTheadClass}>
              <tr>
                <th className={panelListDenseActionsOnlyHeaderClass}>Akcje</th>
                {[
                  "Zdjęcie",
                  "SKU",
                  "EAN",
                  "Produkt",
                  "Stan",
                  "Sprzedano",
                  "Przychód netto",
                  "Koszt sprzedaży",
                  "Zysk PLN",
                  "Marża %",
                  "Cena sprzedaży brutto",
                  "Całkowity koszt netto",
                  "Wartość magazynowa",
                  "Rotacja",
                  "Dni pokrycia",
                  "Status",
                ].map((h) => (
                  <th key={h} className={`${panelListDenseThBase} text-left`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={17} className={`${panelListDenseTdBase} py-8 text-center text-slate-500`}>
                    Ładowanie...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={17} className={`${panelListDenseTdBase} py-8 text-center text-rose-600`}>
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={17} className={`${panelListDenseTdBase} py-8 text-center text-slate-500`}>
                    Brak danych dla wybranych filtrów.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const badge = statusPill(r.status);
                  return (
                    <tr key={r.product_id} className={panelListDenseRowClass} onClick={() => setActive(r)}>
                      <td className={panelListDenseActionsOnlyCellClass} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className={panelListDenseRowActionBtn}
                          title="Szczegóły"
                          aria-label="Szczegóły"
                          onClick={() => setActive(r)}
                        >
                          <Eye className="h-4 w-4 text-gray-600" strokeWidth={2} aria-hidden />
                        </button>
                      </td>
                      <td className={panelListDenseTdBase}>
                        {r.image_url ? (
                          <img src={r.image_url} alt={r.product_name} className="h-10 w-10 rounded border border-slate-200 object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded border border-slate-200 bg-slate-100" />
                        )}
                      </td>
                      <td className={`${panelListDenseTdBase} text-slate-700`}>{r.sku ?? "—"}</td>
                      <td className={`${panelListDenseTdBase} text-slate-700`}>{r.ean ?? "—"}</td>
                      <td className={`${panelListDenseTdBase} font-medium text-slate-900`}>{r.product_name}</td>
                      <td className={panelListDenseTdBase}>{qty(r.stock_qty)}</td>
                      <td className={panelListDenseTdBase}>{qty(r.sold_qty)}</td>
                      <td className={panelListDenseTdBase}>{money(r.revenue_net)}</td>
                      <td className={panelListDenseTdBase}>{money(r.cost_of_goods)}</td>
                      <td className={panelListDenseTdBase}>{money(r.profit_value)}</td>
                      <td className={panelListDenseTdBase}>{pct(r.margin_percent)}</td>
                      <td className={panelListDenseTdBase}>{money(r.sale_gross)}</td>
                      <td className={panelListDenseTdBase}>{money(r.landed_cost_net)}</td>
                      <td className={panelListDenseTdBase}>{money(r.frozen_capital)}</td>
                      <td className={panelListDenseTdBase}>{r.rotation == null ? "—" : qty(r.rotation)}</td>
                      <td className={panelListDenseTdBase}>{r.days_cover == null ? "—" : qty(r.days_cover)}</td>
                      <td className={panelListDenseTdBase}>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-5">
              <p className="text-sm text-slate-600">
                Strona {page} / {totalPages}{" "}
                <span className="text-slate-400">·</span> {data?.pagination.total ?? 0} rekordów
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => setPage((x) => Math.max(1, x - 1))}
                >
                  Poprzednia
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={page >= totalPages}
                  onClick={() => setPage((x) => Math.min(totalPages, x + 1))}
                >
                  Następna
                </button>
              </div>
            </div>
            </div>
      </PageLayout>

      {active && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]">
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl md:rounded-l-2xl">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Szczegóły rentowności</h3>
              <button className="rounded border border-slate-300 px-2 py-1 text-sm" onClick={() => setActive(null)}>
                Zamknij
              </button>
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">{active.sku ?? "—"} / {active.ean ?? "—"}</p>
                <p className="text-base font-semibold text-slate-800">{active.product_name}</p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Struktura kosztów</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Koszt zakupu: <b>{money(active.purchase_price)}</b></div>
                  <div>Pakowanie: <b>{money(active.extra_cost_net)}</b></div>
                  <div>Łączny koszt netto: <b>{money(active.landed_cost_net)}</b></div>
                  <div>Cena sprzedaży brutto: <b>{money(active.sale_gross)}</b></div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sprzedaż</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Sprzedana ilość: <b>{qty(active.sold_qty)}</b></div>
                  <div>Przychód: <b>{money(active.revenue_net)}</b></div>
                  <div>Zysk brutto: <b>{money(active.profit_value)}</b></div>
                  <div>Marża %: <b>{pct(active.margin_percent)}</b></div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Historyczne dane</p>
                <div className="space-y-2 text-xs text-slate-600">
                  <div className="rounded bg-slate-100 p-2">Sprzedaż 30 dni: dostępny w kolejnej wersji API</div>
                  <div className="rounded bg-slate-100 p-2">Trend marży: na podstawie historycznych zapisów rentowności</div>
                  <div className="rounded bg-slate-100 p-2">Trend cen: na podstawie ostatnich cen zakupu i sprzedaży</div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Rekomendacje</p>
                <div className="flex flex-wrap gap-2">
                  {active.recommendations.map((r) => (
                    <span key={r} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-full min-h-[5.5rem] flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/40 p-4 shadow-sm">
      <p className="text-xs font-medium leading-snug text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

