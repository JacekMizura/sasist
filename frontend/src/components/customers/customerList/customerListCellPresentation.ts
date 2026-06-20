import type { CustomerListRow } from "../../../api/customersApi";
import { formatCustomerMoney } from "../../../modules/customers/customerProfile";
import { getCustomerDisplayName } from "../../../utils/getCustomerDisplayName";

export function customerListClientLines(row: CustomerListRow): {
  primary: string;
  secondary: string | null;
} {
  const primary = getCustomerDisplayName(row);
  const nip = row.nip?.trim();
  const email = row.email?.trim();

  if (nip) {
    return { primary, secondary: `NIP: ${nip}` };
  }
  if (email) {
    return { primary, secondary: email };
  }
  return { primary, secondary: null };
}

export function customerListCellOrDash(value: string | null | undefined): string {
  const v = value?.trim();
  return v ? v : "—";
}

function formatListDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatListDateTime(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatOptionalCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pl-PL");
}

function formatOptionalMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatCustomerMoney(value);
}

function formatOptionalPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}%`;
}

/** Wartość komórki dla opcjonalnych kolumn rozszerzonych (brak w API → —). */
export function customerListExtendedColumnText(row: CustomerListRow, columnId: string): string {
  switch (columnId) {
    case "created_at":
      return formatListDate(row.created_at);
    case "last_purchase":
      return formatListDateTime(row.last_order_at);
    case "orders":
      return formatOptionalCount(row.order_count);
    case "returns":
      return formatOptionalCount(row.returns_count);
    case "total_net":
      return formatOptionalMoney(row.total_net);
    case "total_gross":
      return formatOptionalMoney(row.total_gross);
    case "global_discount":
      return formatOptionalPercent(row.global_discount_percent);
    default:
      return "—";
  }
}
