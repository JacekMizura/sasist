import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchCustomerPurchaseDocuments,
  fetchCustomerPurchaseSummary,
  fetchCustomerPurchaseTrend,
  fetchCustomerTopProducts,
  type PurchaseHistoryQueryFilters,
  type PurchaseHistorySummary,
} from "../../api/customerPurchaseHistoryApi";
import { getCustomer } from "../../api/customersApi";
import { getCustomerDisplayName } from "../../utils/getCustomerDisplayName";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { CustomerDetailPageShell } from "./CustomerDetailPageShell";
import { CustomerPurchaseHistoryDocumentsTable } from "./purchaseHistory/CustomerPurchaseHistoryDocumentsTable";
import { CustomerPurchaseHistoryFilters } from "./purchaseHistory/CustomerPurchaseHistoryFilters";
import { CustomerPurchaseHistoryKpi } from "./purchaseHistory/CustomerPurchaseHistoryKpi";
import { CustomerPurchaseHistoryTopProducts } from "./purchaseHistory/CustomerPurchaseHistoryTopProducts";
import { CustomerPurchaseHistoryTrendChart } from "./purchaseHistory/CustomerPurchaseHistoryTrendChart";

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
      .then((c) => setDisplayName(getCustomerDisplayName(c)))
      .catch(() => setDisplayName(getCustomerDisplayName({ id: customerId })));
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
      <CustomerDetailPageShell
        customerId={null}
        title="Klient"
        sectionLabel="Historia zakupów"
      >
        <p className="text-sm text-red-700">Nieprawidłowy identyfikator klienta.</p>
      </CustomerDetailPageShell>
    );
  }

  const title = displayName ?? getCustomerDisplayName({ id: customerId });

  return (
    <CustomerDetailPageShell
      customerId={customerId}
      title={title}
      subtitle="Podsumowanie zakupów, dokumenty i trendy sprzedaży klienta."
      sectionLabel="Historia zakupów"
      showTabs
    >
      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{err}</p>
      ) : null}

      <CustomerPurchaseHistoryKpi summary={summary} loading={loading} />

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
    </CustomerDetailPageShell>
  );
}
