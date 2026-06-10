import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";
import {
  fetchCustomerPurchaseDocuments,
  fetchCustomerPurchaseSummary,
  fetchCustomerPurchaseTrend,
  fetchCustomerTopProducts,
  type PurchaseHistoryQueryFilters,
  type PurchaseHistorySummary,
} from "../../api/customerPurchaseHistoryApi";
import { getCustomer } from "../../api/customersApi";
import { panelDetailPageOuterClass } from "../../components/panelDetail/panelDetailLayout";
import { PageGutter } from "../../components/layout/PageContainer";
import { listSellasistToolbarSquareBtn } from "../../components/listPage/listSellasistTokens";
import { UI_STRINGS } from "../../constants/uiStrings";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { CustomerDetailTabs } from "./CustomerDetailTabs";
import { CustomerPurchaseHistoryDocumentsTable } from "./purchaseHistory/CustomerPurchaseHistoryDocumentsTable";
import { CustomerPurchaseHistoryFilters } from "./purchaseHistory/CustomerPurchaseHistoryFilters";
import { CustomerPurchaseHistoryKpi } from "./purchaseHistory/CustomerPurchaseHistoryKpi";
import { CustomerPurchaseHistoryTopProducts } from "./purchaseHistory/CustomerPurchaseHistoryTopProducts";
import { CustomerPurchaseHistoryTrendChart } from "./purchaseHistory/CustomerPurchaseHistoryTrendChart";

const MAIN_CARD_CLASS =
  "rounded-xl border border-slate-200/90 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_28px_rgba(15,23,42,0.07)] space-y-6";

const EMPTY_FILTERS: PurchaseHistoryQueryFilters = {};

export default function CustomerPurchaseHistoryPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const tenantId = DAMAGE_TENANT_ID;
  const customerId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<PurchaseHistoryQueryFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<PurchaseHistoryQueryFilters>(EMPTY_FILTERS);
  const [summary, setSummary] = useState<PurchaseHistorySummary | null>(null);
  const [documents, setDocuments] = useState<Awaited<ReturnType<typeof fetchCustomerPurchaseDocuments>> | null>(null);
  const [topProducts, setTopProducts] = useState<Awaited<ReturnType<typeof fetchCustomerTopProducts>> | null>(null);
  const [trend, setTrend] = useState<Awaited<ReturnType<typeof fetchCustomerPurchaseTrend>> | null>(null);
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("month");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (customerId == null) return;
    void getCustomer(customerId, tenantId)
      .then((c) => {
        const comp = (c.company_name || "").trim();
        const person = `${c.first_name || ""} ${c.last_name || ""}`.trim();
        setDisplayName(comp || person || `Klient #${customerId}`);
      })
      .catch(() => setDisplayName(`Klient #${customerId}`));
  }, [customerId, tenantId]);

  const filtersKey = useMemo(() => JSON.stringify(appliedFilters), [appliedFilters]);

  const loadAll = useCallback(async () => {
    if (customerId == null) return;
    setLoading(true);
    setErr(null);
    try {
      const [sum, docs, top, tr] = await Promise.all([
        fetchCustomerPurchaseSummary(customerId, tenantId, appliedFilters),
        fetchCustomerPurchaseDocuments(customerId, tenantId, appliedFilters, { page, page_size: 25 }),
        fetchCustomerTopProducts(customerId, tenantId, appliedFilters, 10),
        fetchCustomerPurchaseTrend(customerId, tenantId, appliedFilters, granularity),
      ]);
      setSummary(sum);
      setDocuments(docs);
      setTopProducts(top);
      setTrend(tr);
    } catch {
      setErr("Nie udało się wczytać historii zakupów.");
    } finally {
      setLoading(false);
    }
  }, [customerId, tenantId, appliedFilters, page, granularity]);

  useEffect(() => {
    void loadAll();
  }, [loadAll, filtersKey, page, granularity]);

  const onApplyFilters = () => {
    setPage(1);
    setAppliedFilters({ ...draftFilters });
  };

  const onClearFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  if (customerId == null) {
    return (
      <div className={panelDetailPageOuterClass}>
        <PageGutter>
          <p className="text-sm text-red-700">Nieprawidłowy identyfikator klienta.</p>
        </PageGutter>
      </div>
    );
  }

  const breadcrumbTitle = displayName ?? `Klient #${customerId}`;

  return (
    <div className={panelDetailPageOuterClass}>
      <PageGutter>
        <nav className="mb-2.5 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Ścieżka nawigacji">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 font-medium text-slate-500 transition hover:text-slate-800"
            aria-label="Panel"
          >
            <Home className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          </Link>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
          <Link to="/customers" className="font-medium text-slate-500 transition hover:text-slate-800">
            {UI_STRINGS.navigation.customersList}
          </Link>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
          <Link to={`/customers/${customerId}`} className="font-medium text-slate-500 transition hover:text-slate-800">
            {breadcrumbTitle}
          </Link>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
          <span className="font-medium text-slate-600">Historia zakupów</span>
        </nav>

        <div className={MAIN_CARD_CLASS}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h1 className="text-lg font-semibold leading-snug tracking-tight text-slate-900 sm:text-xl">
                {breadcrumbTitle}
              </h1>
              <p className="mt-1 text-sm text-slate-500">Podsumowanie zakupów, dokumenty i trendy sprzedaży klienta.</p>
            </div>
            <Link
              to="/customers"
              className={listSellasistToolbarSquareBtn}
              title="Lista klientów"
              aria-label="Lista klientów"
            >
              <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            </Link>
          </div>

          <CustomerDetailTabs />

          {err ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{err}</p>
          ) : null}

          <CustomerPurchaseHistoryKpi summary={summary} />

          <CustomerPurchaseHistoryFilters
            draft={draftFilters}
            options={summary?.filter_options ?? null}
            onChange={(patch) => setDraftFilters((prev) => ({ ...prev, ...patch }))}
            onApply={onApplyFilters}
            onClear={onClearFilters}
          />

          <CustomerPurchaseHistoryDocumentsTable
            rows={documents?.items ?? []}
            loading={loading}
            page={documents?.page ?? page}
            pages={documents?.pages ?? 1}
            onPageChange={setPage}
          />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <CustomerPurchaseHistoryTopProducts items={topProducts?.items ?? []} loading={loading} />
            <CustomerPurchaseHistoryTrendChart
              points={trend?.points ?? []}
              granularity={granularity}
              loading={loading}
              onGranularityChange={setGranularity}
            />
          </div>
        </div>
      </PageGutter>
    </div>
  );
}
