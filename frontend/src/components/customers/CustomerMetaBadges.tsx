import { formatLastPurchaseLabel } from "../../hooks/customers/useCustomerHeaderSummary";

const pill =
  "inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700";

type Props = {
  customerType?: string | null;
  email?: string | null;
  phone?: string | null;
  nip?: string | null;
  orderCount?: number;
  lastPurchaseAt?: string | null;
};

export function CustomerMetaBadges({
  customerType,
  email,
  phone,
  nip,
  orderCount,
  lastPurchaseAt,
}: Props) {
  const items: string[] = [];
  if (customerType?.trim()) items.push(customerType.trim());
  if (email?.trim()) items.push(email.trim());
  if (phone?.trim()) items.push(phone.trim());
  if (nip?.trim()) items.push(`NIP: ${nip.trim()}`);
  if (orderCount != null) items.push(`${orderCount.toLocaleString("pl-PL")} zamówień`);
  if (lastPurchaseAt !== undefined) {
    const label = formatLastPurchaseLabel(lastPurchaseAt);
    if (label !== "—") items.push(`Ostatni zakup: ${label}`);
  }

  if (!items.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((label) => (
        <span key={label} className={pill}>
          {label}
        </span>
      ))}
    </div>
  );
}

export function resolveCustomerTypeLabel(detail: {
  company_name?: string | null;
  nip?: string | null;
  default_document_type?: string | null;
} | null): string {
  if (!detail) return "Klient";
  if ((detail.company_name ?? "").trim()) return "Firma";
  if ((detail.nip ?? "").trim()) return "Faktura VAT";
  return detail.default_document_type === "INVOICE" ? "Faktura" : "Klient detaliczny";
}
