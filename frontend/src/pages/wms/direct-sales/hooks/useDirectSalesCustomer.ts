import { useCallback, useEffect, useRef, useState } from "react";

import { extractApiErrorMessage } from "../../../../api/apiErrorMessage";
import {
  createCustomer,
  getCustomer,
  listCustomers,
  type CustomerDetail,
  type CustomerListRow,
} from "../../../../api/customersApi";
import { DAMAGE_TENANT_ID } from "../../../../constants/panelTenant";
import { safeTrim } from "../../../../utils/safeStrings";
import { clearDirectSaleCustomer, setDirectSaleCustomer } from "../services/directSalesApi";
import type { DirectSaleSession } from "../../../../utils/normalizeDirectSales";

const DEBOUNCE_MS = 150;

type Args = {
  sessionId: number | null;
  customerId: number | null;
  onSessionUpdated: (session: import("../../../../utils/normalizeDirectSales").DirectSaleSession) => void;
};

export function useDirectSalesCustomer({ sessionId, customerId, onSessionUpdated }: Args) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CustomerListRow[]>([]);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (customerId == null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void getCustomer(customerId, DAMAGE_TENANT_ID)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  useEffect(() => {
    const q = safeTrim(search);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
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
          if (reqId.current === id) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [search]);

  const attachCustomer = useCallback(
    async (id: number | null) => {
      if (!sessionId) return;
      setBusy(true);
      setError(null);
      try {
        let updated: DirectSaleSession;
        if (id == null) {
          updated = await clearDirectSaleCustomer({ tenantId: DAMAGE_TENANT_ID, sessionId });
          setDetail(null);
          setSearch("");
        } else {
          updated = await setDirectSaleCustomer({ tenantId: DAMAGE_TENANT_ID, sessionId, customerId: id });
          const d = await getCustomer(id, DAMAGE_TENANT_ID);
          setDetail(d);
        }
        onSessionUpdated(updated);
      } catch (e) {
        setError(extractApiErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [sessionId, onSessionUpdated],
  );

  const quickCreate = useCallback(
    async (fields: {
      firstName: string;
      lastName: string;
      phone?: string;
      email?: string;
      nip?: string;
      companyName?: string;
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
          addresses: [],
          product_discounts: [],
        });
        await attachCustomer(created.id);
        setSearch("");
        setResults([]);
      } catch (e) {
        setError(extractApiErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [attachCustomer],
  );

  return {
    search,
    setSearch,
    results,
    detail,
    loading,
    busy,
    error,
    attachCustomer,
    quickCreate,
  };
}
