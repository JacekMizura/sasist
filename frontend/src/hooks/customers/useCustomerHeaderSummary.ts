import { useCallback, useEffect, useState } from "react";

import { fetchCustomerPurchaseSummary } from "../../api/customerPurchaseHistoryApi";
import { getCustomer, type CustomerDetail } from "../../api/customersApi";
import { getCustomerDisplayName } from "../../utils/getCustomerDisplayName";

export type CustomerHeaderSummary = {
  detail: CustomerDetail | null;
  displayName: string;
  orderCount: number;
  lastPurchaseAt: string | null;
  totalGross: number;
  totalNet: number;
  avgBasketGross: number;
  returnsCount: number;
  topCategoryLabel: string | null;
  loading: boolean;
  applyDetail: (detail: CustomerDetail) => void;
  refresh: () => void;
};

function daysAgoLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff <= 0) return "dziś";
  if (diff === 1) return "wczoraj";
  return `${diff} dni temu`;
}

export function formatLastPurchaseLabel(iso: string | null | undefined): string {
  const rel = daysAgoLabel(iso);
  if (rel) return rel;
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pl-PL");
}

function applySummaryFromDetail(
  cust: CustomerDetail,
  summary: Awaited<ReturnType<typeof fetchCustomerPurchaseSummary>> | null,
  setters: {
    setDetail: (v: CustomerDetail) => void;
    setOrderCount: (v: number) => void;
    setLastPurchaseAt: (v: string | null) => void;
    setTotalGross: (v: number) => void;
    setTotalNet: (v: number) => void;
    setAvgBasketGross: (v: number) => void;
    setReturnsCount: (v: number) => void;
  },
) {
  setters.setDetail(cust);
  const s = cust.summary;
  if (s) {
    setters.setOrderCount(s.order_count);
    setters.setLastPurchaseAt(s.last_order_at ?? null);
    setters.setTotalGross(s.total_gross);
    setters.setTotalNet(s.total_net);
    setters.setAvgBasketGross(s.avg_basket_gross);
    setters.setReturnsCount(s.returns_count);
    return;
  }
  if (summary) {
    setters.setOrderCount(summary.order_count);
    setters.setLastPurchaseAt(summary.last_purchase_at);
    setters.setTotalGross(summary.total_gross);
    setters.setTotalNet(summary.total_net);
    setters.setAvgBasketGross(summary.avg_basket_gross);
    setters.setReturnsCount(summary.returns_corrections_count);
  }
}

export function useCustomerHeaderSummary(
  customerId: number | null,
  tenantId: number,
): CustomerHeaderSummary {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [orderCount, setOrderCount] = useState(0);
  const [lastPurchaseAt, setLastPurchaseAt] = useState<string | null>(null);
  const [totalGross, setTotalGross] = useState(0);
  const [totalNet, setTotalNet] = useState(0);
  const [avgBasketGross, setAvgBasketGross] = useState(0);
  const [returnsCount, setReturnsCount] = useState(0);
  const [topCategoryLabel, setTopCategoryLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(customerId != null);
  const [reloadKey, setReloadKey] = useState(0);

  const applyDetail = useCallback((cust: CustomerDetail) => {
    applySummaryFromDetail(cust, null, {
      setDetail,
      setOrderCount,
      setLastPurchaseAt,
      setTotalGross,
      setTotalNet,
      setAvgBasketGross,
      setReturnsCount,
    });
  }, []);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (customerId == null) {
      setDetail(null);
      setOrderCount(0);
      setLastPurchaseAt(null);
      setTotalGross(0);
      setTotalNet(0);
      setAvgBasketGross(0);
      setReturnsCount(0);
      setTopCategoryLabel(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      getCustomer(customerId, tenantId),
      fetchCustomerPurchaseSummary(customerId, tenantId, {}),
    ])
      .then(([cust, summary]) => {
        if (cancelled) return;
        applySummaryFromDetail(cust, summary, {
          setDetail,
          setOrderCount,
          setLastPurchaseAt,
          setTotalGross,
          setTotalNet,
          setAvgBasketGross,
          setReturnsCount,
        });
        setTopCategoryLabel(null);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, tenantId, reloadKey]);

  const displayName = detail
    ? getCustomerDisplayName(detail)
    : customerId != null
      ? getCustomerDisplayName({ id: customerId })
      : "Klient";

  return {
    detail,
    displayName,
    orderCount,
    lastPurchaseAt,
    totalGross,
    totalNet,
    avgBasketGross,
    returnsCount,
    topCategoryLabel,
    loading,
    applyDetail,
    refresh,
  };
}
