import { useCallback, useEffect, useRef, useState } from "react";

import { extractApiErrorMessage } from "../../api/apiErrorMessage";
import {
  createCustomer,
  getCustomer,
  listCustomers,
  type CustomerDetail,
  type CustomerListRow,
} from "../../api/customersApi";
import { clearDirectSaleCustomer, setDirectSaleCustomer } from "../../api/directSalesApi";
import type { DirectSaleSession } from "../../utils/normalizeDirectSales";
import { formatDirectSalesMutationError } from "../../modules/directSales/errors/directSalesMutationErrors";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { safeTrim } from "../../utils/safeStrings";

const DEBOUNCE_MS = 150;

type Args = {
  warehouseId: number | null;
  sessionId: number | null;
  customerId: number | null;
  customerIsRetail: boolean;
  onSessionUpdated: (session: DirectSaleSession) => void;
};

export function useDirectSalesCustomer({
  warehouseId,
  sessionId,
  customerId,
  customerIsRetail,
  onSessionUpdated,
}: Args) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CustomerListRow[]>([]);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nipLookupLoading, setNipLookupLoading] = useState(false);
  const reqId = useRef(0);

  const resetSearchState = useCallback(() => {
    reqId.current += 1;
    setSearch("");
    setResults([]);
    setSearchLoading(false);
  }, []);

  const resetCustomerState = useCallback(() => {
    resetSearchState();
    setDetail(null);
    setDetailLoading(false);
    setError(null);
  }, [resetSearchState]);

  useEffect(() => {
    if (customerId == null || customerIsRetail) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void getCustomer(customerId, DAMAGE_TENANT_ID)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, customerIsRetail]);

  useEffect(() => {
    if (customerIsRetail) {
      setDetail(null);
      setDetailLoading(false);
    }
  }, [customerIsRetail]);

  useEffect(() => {
    const q = safeTrim(search);
    if (q.length < 2) {
      reqId.current += 1;
      setResults([]);
      setSearchLoading(false);
      return;
    }
    const id = ++reqId.current;
    setSearchLoading(true);
    const t = window.setTimeout(() => {
      void listCustomers({ tenant_id: DAMAGE_TENANT_ID, search: q })
        .then((rows) => {
          if (reqId.current !== id) return;
          setResults(rows.slice(0, 8));
        })
        .catch(() => {
          if (reqId.current === id) setResults([]);
        })
        .finally(() => {
          if (reqId.current === id) setSearchLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      if (reqId.current === id) setSearchLoading(false);
    };
  }, [search]);

  const refreshCustomerDetail = useCallback(async (id: number | null) => {
    if (id == null) {
      setDetail(null);
      return;
    }
    try {
      const d = await getCustomer(id, DAMAGE_TENANT_ID);
      setDetail(d);
    } catch {
      setDetail(null);
    }
  }, []);

  const attachCustomer = useCallback(
    async (id: number | null) => {
      if (!sessionId || warehouseId == null) return;
      const scope = { tenantId: DAMAGE_TENANT_ID, warehouseId };
      setBusy(true);
      setError(null);
      try {
        let updated: DirectSaleSession;
        if (id == null) {
          updated = await clearDirectSaleCustomer({ ...scope, sessionId });
          resetCustomerState();
        } else {
          updated = await setDirectSaleCustomer({ ...scope, sessionId, customerId: id });
          const d = await getCustomer(id, DAMAGE_TENANT_ID);
          setDetail(d);
        }
        onSessionUpdated(updated);
      } catch (e) {
        const { message, devDetail } = formatDirectSalesMutationError(e, "set-customer");
        setError(devDetail ? `${message} (${devDetail})` : message);
      } finally {
        setBusy(false);
      }
    },
    [warehouseId, sessionId, onSessionUpdated, resetCustomerState],
  );

  const lookupByNip = useCallback(
    async (nip: string) => {
      const q = safeTrim(nip).replace(/\D/g, "");
      if (q.length < 10) return null;
      setNipLookupLoading(true);
      setError(null);
      try {
        const rows = await listCustomers({ tenant_id: DAMAGE_TENANT_ID, search: q });
        const hit = rows.find((r) => (r.nip ?? "").replace(/\D/g, "") === q) ?? rows[0];
        if (hit) {
          await attachCustomer(hit.id);
          return hit;
        }
        return null;
      } catch (e) {
        setError(extractApiErrorMessage(e));
        return null;
      } finally {
        setNipLookupLoading(false);
      }
    },
    [attachCustomer],
  );

  const quickCreate = useCallback(
    async (fields: {
      firstName: string;
      lastName: string;
      phone?: string;
      email?: string;
      nip?: string;
      companyName?: string;
      street?: string;
      city?: string;
      postalCode?: string;
    }) => {
      setBusy(true);
      setError(null);
      try {
        const created = await createCustomer({
          tenant_id: DAMAGE_TENANT_ID,
          first_name: safeTrim(fields.firstName) || "Klient",
          last_name: safeTrim(fields.lastName) || "Terminal",
          phone: safeTrim(fields.phone) || null,
          email: safeTrim(fields.email) || null,
          nip: safeTrim(fields.nip) || null,
          company_name: safeTrim(fields.companyName) || null,
          country_code: "PL",
          default_document_type: safeTrim(fields.nip) ? "INVOICE" : "RECEIPT",
          global_discount_percent: 0,
          addresses:
            safeTrim(fields.street) && safeTrim(fields.city)
              ? [
                  {
                    first_name: safeTrim(fields.firstName) || "Klient",
                    last_name: safeTrim(fields.lastName) || "Terminal",
                    street: safeTrim(fields.street) || "—",
                    house_number: "1",
                    postal_code: safeTrim(fields.postalCode) || "00-000",
                    city: safeTrim(fields.city) || "—",
                    country_code: "PL",
                    is_default: true,
                  },
                ]
              : [],
          product_discounts: [],
        });
        await attachCustomer(created.id);
        resetSearchState();
        return created;
      } catch (e) {
        setError(extractApiErrorMessage(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [attachCustomer, resetSearchState],
  );

  return {
    search,
    setSearch,
    results,
    detail,
    /** @deprecated use searchLoading */
    loading: searchLoading,
    searchLoading,
    detailLoading,
    busy,
    error,
    nipLookupLoading,
    attachCustomer,
    lookupByNip,
    quickCreate,
    refreshCustomerDetail,
    resetCustomerState,
  };
}

export type DirectSalesCustomerState = ReturnType<typeof useDirectSalesCustomer>;
