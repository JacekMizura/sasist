import { useEffect, useState } from "react";

import { fetchCustomerPurchaseSummary } from "../../api/customerPurchaseHistoryApi";
import { getCustomer, type CustomerDetail } from "../../api/customersApi";
import { getCustomerDisplayName } from "../../utils/getCustomerDisplayName";

export type CustomerHeaderSummary = {
  detail: CustomerDetail | null;
  displayName: string;
  orderCount: number;
  lastPurchaseAt: string | null;
  totalGross: number;
  avgBasketGross: number;
  returnsCount: number;
  topCategoryLabel: string | null;
  loading: boolean;
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

export function useCustomerHeaderSummary(
  customerId: number | null,
  tenantId: number,
): CustomerHeaderSummary {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [orderCount, setOrderCount] = useState(0);
  const [lastPurchaseAt, setLastPurchaseAt] = useState<string | null>(null);
  const [totalGross, setTotalGross] = useState(0);
  const [avgBasketGross, setAvgBasketGross] = useState(0);
  const [returnsCount, setReturnsCount] = useState(0);
  const [topCategoryLabel, setTopCategoryLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(customerId != null);

  useEffect(() => {
    if (customerId == null) {
      setDetail(null);
      setOrderCount(0);
      setLastPurchaseAt(null);
      setTotalGross(0);
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
        setDetail(cust);
        setOrderCount(summary.order_count);
        setLastPurchaseAt(summary.last_purchase_at);
        setTotalGross(summary.total_gross);
        setAvgBasketGross(summary.avg_basket_gross);
        setReturnsCount(summary.returns_corrections_count);
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
  }, [customerId, tenantId]);

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
    avgBasketGross,
    returnsCount,
    topCategoryLabel,
    loading,
  };
}
