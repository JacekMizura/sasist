import type { CustomerListRow } from "../../../api/customersApi";
import { formatCustomerMoney } from "../../../modules/customers/customerProfile";
import { safeTrim } from "../../../utils/safeStrings";

export const CUSTOMER_LIST_MISSING_NAME = "— brak nazwy —";

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Wyłącznie nazwa firmy lub imię i nazwisko — bez e-maila, NIP-u i innych pól.
 * API listy zwraca `display_name` zgodnie z tą samą regułą (firma → osoba).
 */
export function customerListClientName(row: CustomerListRow): string {
  const company = safeTrim(row.company_name);
  if (company) return company;

  const person = `${safeTrim(row.first_name)} ${safeTrim(row.last_name)}`.trim();
  if (person) return person;

  const display = safeTrim(row.display_name);
  if (display && !/^#\d+$/.test(display) && !looksLikeEmail(display)) {
    return display;
  }

  return CUSTOMER_LIST_MISSING_NAME;
}

/** @deprecated Użyj {@link customerListClientName}. */
export function customerListClientLines(row: CustomerListRow): {
  primary: string;
  secondary: string | null;
} {
  const primary = customerListClientName(row);
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
