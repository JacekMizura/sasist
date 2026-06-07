import { paymentStatusPl } from "../directSalesTerminology";

type Props = {
  status: string | null | undefined;
};

function badgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "PAID" || s === "SETTLED" || s === "CAPTURED")
    return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (s === "PENDING") return "bg-amber-50 text-amber-700 border border-amber-200";
  if (s === "FAILED" || s === "CANCELLED") return "bg-red-50 text-red-700 border border-red-200";
  return "bg-slate-50 text-slate-600 border border-slate-200";
}

export function PaymentStatusBadge({ status }: Props) {
  if (!status) return null;
  return (
    <span
      className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${badgeClass(String(status))}`}
    >
      {paymentStatusPl(status)}
    </span>
  );
}
