import type { CustomerHeaderSummary } from "../../hooks/customers/useCustomerHeaderSummary";
import { formatLastPurchaseLabel } from "../../hooks/customers/useCustomerHeaderSummary";
import { formatCustomerMoney, isWholesaleType } from "../../modules/customers/customerProfile";

type Props = {
  summary: CustomerHeaderSummary;
  loading?: boolean;
};

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[7.5rem] flex-1 rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

export function CustomerSummaryStrip({ summary, loading }: Props) {
  const d = summary.detail;
  const wholesale = isWholesaleType(d?.customer_type);
  const last = formatLastPurchaseLabel(summary.lastPurchaseAt);

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Podsumowanie klienta</h2>
        {wholesale ? (
          <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
            Profil hurtowy
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Kpi label="Obrót brutto" value={loading ? "…" : formatCustomerMoney(summary.totalGross)} />
        <Kpi label="Obrót netto" value={loading ? "…" : formatCustomerMoney(summary.totalNet)} />
        <Kpi label="Zamówienia" value={loading ? "…" : String(summary.orderCount)} />
        <Kpi label="Śr. koszyk" value={loading ? "…" : formatCustomerMoney(summary.avgBasketGross)} />
        <Kpi label="Ostatni zakup" value={loading ? "…" : last} />
        <Kpi label="Zwroty / korekty" value={loading ? "…" : String(summary.returnsCount)} />
        {wholesale ? (
          <>
            <Kpi
              label="Limit kredytowy"
              value={loading ? "…" : d?.credit_limit_gross != null ? formatCustomerMoney(d.credit_limit_gross) : "—"}
            />
            <Kpi
              label="Termin płatności"
              value={loading ? "…" : d?.payment_terms_days != null ? `${d.payment_terms_days} dni` : "—"}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
