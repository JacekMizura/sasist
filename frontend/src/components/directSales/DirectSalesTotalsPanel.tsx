import type { DirectSaleSessionTotals } from "../../utils/normalizeDirectSales";
import { formatMoneyPl } from "./directSalesTerminology";

type Props = {
  totals: DirectSaleSessionTotals | null | undefined;
  loading?: boolean;
};

export function DirectSalesTotalsPanel({ totals, loading }: Props) {
  if (loading || !totals) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-xs text-slate-400">
        Przeliczanie…
      </div>
    );
  }

  const hasDiscount = totals.total_discount_gross > 0.009;

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-2 text-sm">
      <div className="flex justify-between text-slate-600">
        <span>Suma pozycji</span>
        <span className="font-semibold tabular-nums">{formatMoneyPl(totals.subtotal_gross)}</span>
      </div>
      {hasDiscount ? (
        <>
          {totals.line_discounts_gross > 0.009 ? (
            <div className="flex justify-between text-amber-800">
              <span>Rabaty pozycji</span>
              <span className="font-semibold tabular-nums">−{formatMoneyPl(totals.line_discounts_gross)}</span>
            </div>
          ) : null}
          {totals.order_discount_gross > 0.009 ? (
            <div className="flex justify-between text-amber-800">
              <span>Rabat zamówienia</span>
              <span className="font-semibold tabular-nums">−{formatMoneyPl(totals.order_discount_gross)}</span>
            </div>
          ) : null}
        </>
      ) : null}
      <div className="flex justify-between text-slate-500 text-xs">
        <span>Netto</span>
        <span className="tabular-nums">{formatMoneyPl(totals.total_net)}</span>
      </div>
      <div className="flex justify-between text-slate-500 text-xs">
        <span>VAT</span>
        <span className="tabular-nums">{formatMoneyPl(totals.total_vat)}</span>
      </div>
      <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
        <span>Do zapłaty</span>
        <span className="tabular-nums text-blue-700">{formatMoneyPl(totals.total_gross)}</span>
      </div>
    </div>
  );
}
