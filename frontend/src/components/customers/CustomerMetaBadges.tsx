import type { CustomerDetail } from "../../api/customersApi";
import {
  customerStatusLabel,
  customerTypeLabel,
  formatCustomerMoney,
} from "../../modules/customers/customerProfile";

const pillBase =
  "inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold";

type Props = {
  detail?: CustomerDetail | null;
  orderCount?: number;
  lastPurchaseAt?: string | null;
  compact?: boolean;
};

export function CustomerMetaBadges({ detail, orderCount, lastPurchaseAt, compact = false }: Props) {
  if (!detail && orderCount == null) return null;

  const flags = detail?.flags ?? {};
  const typeLabel = customerTypeLabel(detail?.customer_type);
  const status = String(detail?.customer_status || "active").toLowerCase();
  const count = orderCount ?? detail?.summary?.order_count ?? 0;

  const badges: Array<{ key: string; label: string; className: string }> = [
    { key: "type", label: typeLabel, className: "border-slate-200 bg-slate-50 text-slate-700" },
  ];

  if (flags.vip) {
    badges.push({ key: "vip", label: "VIP", className: "border-amber-200 bg-amber-50 text-amber-900" });
  }
  if (flags.debtor) {
    badges.push({ key: "debtor", label: "Dłużnik", className: "border-rose-200 bg-rose-50 text-rose-800" });
  }
  if (status === "blocked") {
    badges.push({ key: "blocked", label: "Blokada", className: "border-red-300 bg-red-50 text-red-800" });
  } else if (status === "active") {
    badges.push({ key: "active", label: customerStatusLabel(status), className: "border-emerald-200 bg-emerald-50 text-emerald-800" });
  } else if (status === "archived") {
    badges.push({ key: "archived", label: customerStatusLabel(status), className: "border-slate-300 bg-slate-100 text-slate-600" });
  }

  badges.push({
    key: "orders",
    label: `${count.toLocaleString("pl-PL")} zamówień`,
    className: "border-slate-200 bg-white text-slate-700",
  });

  if (!compact && detail?.summary?.total_gross != null && detail.summary.total_gross > 0) {
    badges.push({
      key: "turnover",
      label: formatCustomerMoney(detail.summary.total_gross),
      className: "border-slate-200 bg-white text-slate-700",
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {badges.map((b) => (
        <span key={b.key} className={`${pillBase} ${b.className}`}>
          {b.label}
        </span>
      ))}
      {!compact && lastPurchaseAt ? (
        <span className="text-[11px] font-medium text-slate-500">Ostatni zakup: {lastPurchaseAt}</span>
      ) : null}
    </div>
  );
}

/** @deprecated use customerTypeLabel from customerProfile */
export function resolveCustomerTypeLabel(detail: {
  company_name?: string | null;
  nip?: string | null;
  default_document_type?: string | null;
  customer_type?: string | null;
} | null): string {
  if (!detail) return "Klient";
  if (detail.customer_type) return customerTypeLabel(detail.customer_type);
  if ((detail.company_name ?? "").trim()) return "Firma";
  if ((detail.nip ?? "").trim()) return "Faktura VAT";
  return detail.default_document_type === "INVOICE" ? "Faktura" : "Klient detaliczny";
}
