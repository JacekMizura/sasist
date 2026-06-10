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

export function CustomerPurchaseHistoryKpi({
  summary,
  loading,
}: {
  summary: PurchaseHistorySummary | null;
  loading: boolean;
}) {
  if (loading && !summary) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-md border border-slate-100 bg-slate-50/80" />
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

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
      <AppStatCard label="Obrót 30 dni" value={formatMoneyPl(summary.gross_30d ?? 0)} icon={Wallet} />
      <AppStatCard label="Obrót 90 dni" value={formatMoneyPl(summary.gross_90d ?? 0)} icon={Wallet} />
      <AppStatCard label="Obrót 365 dni" value={formatMoneyPl(summary.gross_365d ?? 0)} icon={Wallet} />
      <AppStatCard label="Średnia wartość koszyka" value={formatMoneyPl(summary.avg_basket_gross)} icon={TrendingUp} />
      <AppStatCard label="Ostatni zakup" value={fmtDate(summary.last_purchase_at)} icon={CalendarDays} />
      <AppStatCard label="Liczba zamówień" value={summary.order_count.toLocaleString("pl-PL")} icon={ShoppingCart} />
      <AppStatCard label="Największe zamówienie" value={formatMoneyPl(summary.max_order_gross ?? 0)} icon={Receipt} />
      <AppStatCard label="Łączna wartość brutto" value={formatMoneyPl(summary.total_gross)} icon={Wallet} />
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
