import type { PurchaseHistorySummary } from "../../../api/customerPurchaseHistoryApi";
import { AppStatCard } from "../../../components/app-shell/AppStatCard";
import { formatMoneyPl } from "../../../utils/formatOrderMoney";
import { CalendarDays, Package, Receipt, RotateCcw, ShoppingCart, TrendingUp, Wallet } from "lucide-react";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pl-PL");
}

function fmtDays(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} dni`;
}

export function CustomerPurchaseHistoryKpi({ summary }: { summary: PurchaseHistorySummary | null }) {
  if (!summary) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[88px] animate-pulse rounded-lg border border-slate-200/90 bg-white" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <AppStatCard label="Łączna wartość brutto" value={formatMoneyPl(summary.total_gross)} icon={Wallet} />
      <AppStatCard label="Łączna wartość netto" value={formatMoneyPl(summary.total_net)} icon={Receipt} />
      <AppStatCard label="Liczba zamówień" value={summary.order_count.toLocaleString("pl-PL")} icon={ShoppingCart} />
      <AppStatCard label="Średnia wartość koszyka" value={formatMoneyPl(summary.avg_basket_gross)} icon={TrendingUp} />
      <AppStatCard label="Ostatni zakup" value={fmtDate(summary.last_purchase_at)} icon={CalendarDays} />
      <AppStatCard
        label="Łączna liczba produktów"
        value={summary.total_products_qty.toLocaleString("pl-PL")}
        icon={Package}
      />
      <AppStatCard
        label="Zwroty / korekty"
        value={summary.returns_corrections_count.toLocaleString("pl-PL")}
        icon={RotateCcw}
      />
      <AppStatCard label="Średni odstęp między zakupami" value={fmtDays(summary.avg_days_between_orders)} icon={CalendarDays} />
    </div>
  );
}
