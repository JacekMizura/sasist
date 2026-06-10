export type CustomerType = "retail" | "wholesale" | "company";
export type CustomerStatus = "active" | "blocked" | "archived";
export type SalesChannel =
  | "store"
  | "ecommerce"
  | "allegro"
  | "amazon"
  | "phone"
  | "b2b_portal"
  | "marketplace_other";

export type CustomerFlags = {
  vip?: boolean;
  debtor?: boolean;
  priority?: boolean;
  suspicious?: boolean;
  requires_invoice?: boolean;
  marketplace?: boolean;
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
};

const STATUS_LABELS: Record<CustomerStatus, string> = {
  active: "Aktywny",
  blocked: "Blokada",
  archived: "Zarchiwizowany",
};

const CHANNEL_LABELS: Record<SalesChannel, string> = {
  store: "Sklep stacjonarny",
  ecommerce: "Sklep internetowy",
  allegro: "Allegro",
  amazon: "Amazon",
  phone: "Telefon",
  b2b_portal: "Portal B2B",
  marketplace_other: "Inny marketplace",
};

export const CUSTOMER_TYPE_OPTIONS: Array<{ value: CustomerType; label: string }> = [
  { value: "retail", label: TYPE_LABELS.retail },
  { value: "company", label: TYPE_LABELS.company },
  { value: "wholesale", label: TYPE_LABELS.wholesale },
];

export const SALES_CHANNEL_OPTIONS: Array<{ value: SalesChannel; label: string }> = [
  { value: "store", label: CHANNEL_LABELS.store },
  { value: "ecommerce", label: CHANNEL_LABELS.ecommerce },
  { value: "allegro", label: CHANNEL_LABELS.allegro },
  { value: "amazon", label: CHANNEL_LABELS.amazon },
  { value: "phone", label: CHANNEL_LABELS.phone },
  { value: "b2b_portal", label: CHANNEL_LABELS.b2b_portal },
  { value: "marketplace_other", label: CHANNEL_LABELS.marketplace_other },
];

export function normalizeCustomerType(raw: string | null | undefined): CustomerType {
  const t = String(raw || "retail").toLowerCase();
  if (t === "b2b") return "wholesale";
  if (t === "marketplace") return "retail";
  if (t === "wholesale" || t === "company") return t;
  return "retail";
}

export function normalizeSalesChannel(raw: string | null | undefined): SalesChannel {
  const t = String(raw || "store").toLowerCase() as SalesChannel;
  return CHANNEL_LABELS[t] ? t : "store";
}

export function customerTypeLabel(type: string | null | undefined): string {
  return TYPE_LABELS[normalizeCustomerType(type)];
}

export function customerStatusLabel(status: string | null | undefined): string {
  const key = String(status || "active").toLowerCase() as CustomerStatus;
  return STATUS_LABELS[key] ?? STATUS_LABELS.active;
}

export function salesChannelLabel(channel: string | null | undefined): string {
  return CHANNEL_LABELS[normalizeSalesChannel(channel)];
}

export function formatCustomerMoney(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return `${n.toLocaleString("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} zł`;
}

export function customerPickerSubtitle(input: {
  customer_type?: string | null;
  sales_channel?: string | null;
  flags?: CustomerFlags | null;
  order_count?: number;
  total_gross?: number;
  nip?: string | null;
}): string {
  const parts: string[] = [];
  const flags = input.flags ?? {};
  if (flags.vip) parts.push("VIP");
  parts.push(customerTypeLabel(input.customer_type));
  if (input.sales_channel && input.sales_channel !== "store") {
    parts.push(salesChannelLabel(input.sales_channel));
  }
  if (flags.marketplace) parts.push("Marketplace");
  if ((input.nip ?? "").trim()) parts.push("VAT");
  const stats =
    input.order_count != null
      ? `${input.order_count.toLocaleString("pl-PL")} zamówień • ${formatCustomerMoney(input.total_gross)}`
      : null;
  return [parts.filter(Boolean).join(" • "), stats].filter(Boolean).join("\n");
}

export function isWholesaleType(type: string | null | undefined): boolean {
  return normalizeCustomerType(type) === "wholesale";
}

export function isCompanyType(type: string | null | undefined): boolean {
  return normalizeCustomerType(type) === "company";
}

export function customerIsBlocked(status: string | null | undefined): boolean {
  return String(status || "").toLowerCase() === "blocked";
}
