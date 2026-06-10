import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import {
  fetchCustomerPurchaseDocuments,
  type PurchaseHistoryQueryFilters,
} from "../../api/customerPurchaseHistoryApi";
import { getCustomerDisplayName } from "../../utils/getCustomerDisplayName";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { CustomerDetailPageShell } from "./CustomerDetailPageShell";
import { CustomerPurchaseHistoryDocumentsTable } from "./purchaseHistory/CustomerPurchaseHistoryDocumentsTable";
import { CustomerPurchaseHistoryFilters } from "./purchaseHistory/CustomerPurchaseHistoryFilters";

const EMPTY_FILTERS: PurchaseHistoryQueryFilters = {};

export default function CustomerDocumentsPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const customerId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;
  const tenantId = DAMAGE_TENANT_ID;

  const [draftFilters, setDraftFilters] = useState<PurchaseHistoryQueryFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<PurchaseHistoryQueryFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Awaited<ReturnType<typeof fetchCustomerPurchaseDocuments>> | null>(null);

  const filtersKey = useMemo(() => JSON.stringify(appliedFilters), [appliedFilters]);

  const loadDocuments = useCallback(async () => {
    if (customerId == null) return;
    setLoading(true);
    setErr(null);
    try {
      const docs = await fetchCustomerPurchaseDocuments(customerId, tenantId, appliedFilters, {
        page,
        page_size: 25,
      });
      setDocuments(docs);
    } catch {
      setErr("Nie udało się wczytać dokumentów klienta.");
    } finally {
      setLoading(false);
    }
  }, [customerId, tenantId, appliedFilters, page]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments, filtersKey, page]);

  if (customerId == null) {
    return (
      <CustomerDetailPageShell customerId={null} title="Klient" sectionLabel="Dokumenty">
        <p className="text-sm text-red-700">Nieprawidłowy identyfikator klienta.</p>
      </CustomerDetailPageShell>
    );
  }

  return (
    <CustomerDetailPageShell
      customerId={customerId}
      title={getCustomerDisplayName({ id: customerId })}
      sectionLabel="Dokumenty"
      showTabs
      onExportHistory={() => void loadDocuments()}
    >
      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{err}</p>
      ) : null}

      <CustomerPurchaseHistoryFilters
        draft={draftFilters}
        onChange={(patch) => setDraftFilters((prev) => ({ ...prev, ...patch }))}
        onApply={() => {
          setPage(1);
          setAppliedFilters({ ...draftFilters });
        }}
        onClear={() => {
          setDraftFilters(EMPTY_FILTERS);
          setAppliedFilters(EMPTY_FILTERS);
          setPage(1);
        }}
      />

      <CustomerPurchaseHistoryDocumentsTable
        rows={documents?.items ?? []}
        loading={loading}
        page={documents?.page ?? page}
        pages={documents?.pages ?? 1}
        onPageChange={setPage}
      />
    </CustomerDetailPageShell>
  );
}
