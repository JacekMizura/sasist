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
    <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-4 text-sm">
      <div className="flex justify-between text-slate-600">
        <span>Suma pozycji</span>
        <span className="tabular-nums font-semibold">{formatMoneyPl(totals.subtotal_gross)}</span>
      </div>
      {hasDiscount ? (
        <div className="flex justify-between text-amber-800">
          <span>Rabat</span>
          <span className="tabular-nums font-semibold">−{formatMoneyPl(totals.total_discount_gross)}</span>
        </div>
      ) : null}
      <div className="flex items-end justify-between border-t border-slate-200 pt-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Do zapłaty</div>
          <div className="text-[11px] font-medium text-slate-400">
            netto {formatMoneyPl(totals.total_net)}
          </div>
        </div>
        <div className="text-3xl font-black tabular-nums tracking-tight text-slate-900">
          {formatMoneyPl(totals.total_gross)}
        </div>
      </div>
    </div>
  );
}
