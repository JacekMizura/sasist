/** Shared PPWR stage 3A labels (projection + forms). */

export const PPWR_FUNCTION_OPTIONS_CARTON = [
  { value: "", label: "— nie ustawiono —" },
  { value: "TRANSPORT", label: "TRANSPORT — opakowanie transportowe" },
  { value: "ECOMMERCE", label: "ECOMMERCE — wysyłka e-commerce" },
  { value: "OUT_OF_SCOPE", label: "OUT_OF_SCOPE — poza zakresem" },
] as const;

export const PPWR_FUNCTION_OPTIONS_PACKAGING = [
  { value: "", label: "— nie ustawiono —" },
  { value: "AUXILIARY", label: "AUXILIARY — materiał pomocniczy" },
  { value: "FILLER", label: "FILLER — wypełnienie" },
  { value: "ECOMMERCE", label: "ECOMMERCE" },
  { value: "TRANSPORT", label: "TRANSPORT" },
  { value: "OUT_OF_SCOPE", label: "OUT_OF_SCOPE — poza zakresem" },
] as const;

export const PPWR_STATUS_LABELS: Record<string, string> = {
  NOT_ASSESSED: "Nie oceniono",
  INCOMPLETE: "Niekompletne",
  READY: "Gotowe",
};

export function ppwrStatusLabel(status: string | null | undefined): string {
  const s = String(status || "NOT_ASSESSED").toUpperCase();
  return PPWR_STATUS_LABELS[s] || s;
}

export function ppwrFunctionLabel(fn: string | null | undefined): string {
  if (!fn) return "—";
  return String(fn).toUpperCase();
}

export function parseOptionalPct(raw: string): number | null | "invalid" {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n)) return "invalid";
  if (n < 0 || n > 100) return "invalid";
  return n;
}
