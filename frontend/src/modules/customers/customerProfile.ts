export type CustomerType = "retail" | "wholesale" | "company" | "marketplace" | "b2b";
export type CustomerStatus = "active" | "blocked" | "archived";

export type CustomerFlags = {
  vip?: boolean;
  debtor?: boolean;
  priority?: boolean;
  suspicious?: boolean;
};

export type CustomerSummary = {
  order_count: number;
  total_gross: number;
  total_net: number;
  avg_basket_gross: number;
  last_order_at?: string | null;
  returns_count: number;
};

const TYPE_LABELS: Record<CustomerType, string> = {
  retail: "Detaliczny",
  wholesale: "Hurtowy",
  company: "Firma",
  marketplace: "Marketplace",
  b2b: "B2B",
};

const STATUS_LABELS: Record<CustomerStatus, string> = {
  active: "Aktywny",
  blocked: "Blokada",
  archived: "Zarchiwizowany",
};

export function customerTypeLabel(type: string | null | undefined): string {
  const key = String(type || "retail").toLowerCase() as CustomerType;
  return TYPE_LABELS[key] ?? TYPE_LABELS.retail;
}

export function customerStatusLabel(status: string | null | undefined): string {
  const key = String(status || "active").toLowerCase() as CustomerStatus;
  return STATUS_LABELS[key] ?? STATUS_LABELS.active;
}

export function formatCustomerMoney(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return `${n.toLocaleString("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} zł`;
}

export function customerPickerSubtitle(input: {
  customer_type?: string | null;
  flags?: CustomerFlags | null;
  order_count?: number;
  total_gross?: number;
  nip?: string | null;
}): string {
  const parts: string[] = [];
  const flags = input.flags ?? {};
  if (flags.vip) parts.push("VIP");
  parts.push(customerTypeLabel(input.customer_type));
  if ((input.nip ?? "").trim()) parts.push("VAT");
  const stats =
    input.order_count != null
      ? `${input.order_count.toLocaleString("pl-PL")} zamówień • ${formatCustomerMoney(input.total_gross)}`
      : null;
  return [parts.filter(Boolean).join(" • "), stats].filter(Boolean).join("\n");
}

export function isWholesaleType(type: string | null | undefined): boolean {
  const t = String(type || "").toLowerCase();
  return t === "wholesale" || t === "b2b";
}

export function customerIsBlocked(status: string | null | undefined): boolean {
  return String(status || "").toLowerCase() === "blocked";
}
