import { useCallback, useEffect, useRef, useState } from "react";

import { extractApiErrorMessage } from "../../../../api/apiErrorMessage";
import { DAMAGE_TENANT_ID } from "../../../../constants/panelTenant";
import { safeTrim } from "../../../../utils/safeStrings";
import {
  searchDirectSaleProducts,
  type DirectSaleProductSearchHit,
} from "../services/directSalesApi";

const DEBOUNCE_MS = 120;

type Args = {
  warehouseId: number | null;
  enabled?: boolean;
};

export function useProductSearch({ warehouseId, enabled = true }: Args) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DirectSaleProductSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const reqId = useRef(0);

  const clear = useCallback(() => {
    setQuery("");
    setHits([]);
    setActiveIndex(-1);
    setError(null);
  }, []);

  useEffect(() => {
    const q = safeTrim(query);
    if (!enabled || warehouseId == null || q.length < 1) {
      setHits([]);
      setLoading(false);
      setActiveIndex(-1);
      return;
    }

    const id = ++reqId.current;
    setLoading(true);
    const t = window.setTimeout(() => {
      void searchDirectSaleProducts({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId,
        q,
      })
        .then((rows) => {
          if (reqId.current !== id) return;
          setHits(rows);
          setActiveIndex(rows.length ? 0 : -1);
          setError(null);
        })
        .catch((e) => {
          if (reqId.current !== id) return;
          setHits([]);
          setActiveIndex(-1);
          setError(extractApiErrorMessage(e));
        })
        .finally(() => {
          if (reqId.current === id) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(t);
  }, [query, warehouseId, enabled]);

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
    error,
    activeIndex,
    setActiveIndex,
    moveActive,
    clear,
    open: safeTrim(query).length > 0,
  };
}
