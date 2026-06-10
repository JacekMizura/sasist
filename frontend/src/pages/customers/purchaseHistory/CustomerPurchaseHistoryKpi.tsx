import type { PurchaseHistorySummary } from "../../../api/customerPurchaseHistoryApi";
import { formatMoneyPl } from "../../../utils/formatOrderMoney";
import { formatLastPurchaseLabel } from "../../../hooks/customers/useCustomerHeaderSummary";
import { CalendarDays, Package, Receipt, RotateCcw, ShoppingCart, TrendingUp, Wallet } from "lucide-react";

export function CustomerPurchaseHistoryKpi({
  summary,
  loading,
  topProductName,
}: {
  summary: PurchaseHistorySummary | null;
  loading: boolean;
  topProductName?: string | null;
}) {
  if (loading && !summary) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[4.5rem] animate-pulse rounded-lg border border-slate-100 bg-white" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  if (summary.order_count === 0) {
    return (
      <p className="rounded-lg border border-slate-200/90 bg-white px-4 py-3 text-sm text-slate-600">
        Brak historii zakupów dla tego klienta.
      </p>
    );
  }

  const cards = [
    { label: "Obrót brutto", value: formatMoneyPl(summary.total_gross), icon: Wallet },
    { label: "Liczba zamówień", value: summary.order_count.toLocaleString("pl-PL"), icon: ShoppingCart },
    { label: "Średni koszyk", value: formatMoneyPl(summary.avg_basket_gross), icon: TrendingUp },
    { label: "Zwroty / korekty", value: summary.returns_corrections_count.toLocaleString("pl-PL"), icon: RotateCcw },
    { label: "Ostatni zakup", value: formatLastPurchaseLabel(summary.last_purchase_at), icon: CalendarDays },
    {
      label: "Top produkt",
      value: topProductName?.trim() || "—",
      icon: Package,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map(({ label, value, icon: Icon }) => (
        <div
          key={label}
          className="rounded-lg border border-slate-200/90 bg-white p-3 shadow-none"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-1 truncate text-lg font-bold tabular-nums text-slate-900" title={String(value)}>
                {value}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-100 text-slate-600">
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
