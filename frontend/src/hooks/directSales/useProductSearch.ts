import { useCallback, useEffect, useRef, useState } from "react";

import { searchDirectSaleProducts, type DirectSaleProductSearchHit } from "../../api/directSalesApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import {
  handleOperationalApiError,
  isEndpointBlocked,
  OPERATIONAL_ENDPOINTS,
} from "../../services/operational/operationalFeatureGuard";
import { safeTrim } from "../../utils/safeStrings";

const DEBOUNCE_MS = 150;

type Args = {
  warehouseId: number | null;
  enabled?: boolean;
  searchEnabled?: boolean;
};

export function useProductSearch({ warehouseId, enabled = true, searchEnabled = true }: Args) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DirectSaleProductSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const reqId = useRef(0);

  const canSearch =
    enabled &&
    searchEnabled &&
    !disabled &&
    !isEndpointBlocked(OPERATIONAL_ENDPOINTS.DIRECT_SALES_SEARCH);

  const clear = useCallback(() => {
    setQuery("");
    setHits([]);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    const q = safeTrim(query);
    if (!canSearch || warehouseId == null || q.length < 1) {
      setHits([]);
      setLoading(false);
      setActiveIndex(-1);
      return;
    }

    const id = ++reqId.current;
    setLoading(true);
    const t = window.setTimeout(() => {
      void searchDirectSaleProducts({ tenantId: DAMAGE_TENANT_ID, warehouseId, q })
        .then((rows) => {
          if (reqId.current !== id) return;
          setHits(rows);
          setActiveIndex(rows.length ? 0 : -1);
        })
        .catch((err) => {
          if (reqId.current !== id) return;
          handleOperationalApiError(err, OPERATIONAL_ENDPOINTS.DIRECT_SALES_SEARCH);
          setHits([]);
          setActiveIndex(-1);
          setDisabled(true);
        })
        .finally(() => {
          if (reqId.current === id) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(t);
  }, [query, warehouseId, canSearch]);

  const moveActive = useCallback(
    (delta: number) => {
      if (!hits.length) return;
      setActiveIndex((i) => {
        const next = i + delta;
        if (next < 0) return hits.length - 1;
        if (next >= hits.length) return 0;
        return next;
      });
    },
    [hits.length],
  );

  return {
    query,
    setQuery,
    hits,
    loading,
    disabled: disabled || !searchEnabled,
    activeIndex,
    moveActive,
    clear,
    open: canSearch && safeTrim(query).length > 0,
  };
}

export type DirectSalesProductSearchState = ReturnType<typeof useProductSearch>;
