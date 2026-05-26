import type { PoStatus } from "../../api/purchasingOrdersApi";

export const STATUS_LABEL: Record<PoStatus, string> = {
  Draft: "Szkic",
  Sent: "Wysłane",
  Confirmed: "Potwierdzone",
  PartiallyReceived: "Częściowo przyjęte",
  Delivered: "Dostarczone (mag.)",
  Closed: "Zamknięte",
  Cancelled: "Anulowane",
};

export function statusBadgeClass(s: PoStatus): string {
  switch (s) {
    case "Draft":
      return "bg-slate-100 text-slate-800 ring-1 ring-slate-200";
    case "Sent":
      return "bg-sky-100 text-sky-900 ring-1 ring-sky-200";
    case "Confirmed":
      return "bg-amber-100 text-amber-950 ring-1 ring-amber-200";
    case "PartiallyReceived":
      return "bg-violet-100 text-violet-900 ring-1 ring-violet-200";
    case "Delivered":
      return "bg-cyan-100 text-cyan-950 ring-1 ring-cyan-200";
    case "Closed":
      return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200";
    case "Cancelled":
      return "bg-red-50 text-red-800 ring-1 ring-red-100";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Domyślna stawka VAT (podgląd netto/brutto z ceny jednostkowej). */
export const VAT_RATE_PL = 0.23;

export function parseLocaleNumber(s: string | undefined): number {
  if (s == null || s === "") return 0;
  const n = Number(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
