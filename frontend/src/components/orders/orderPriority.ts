/** Zgodne z backendem: ``Order.priority_color`` / ``ORDER_PRIORITY_COLOR_VALUES``. */
export const ORDER_PRIORITY_KEYS = ["gray", "blue", "green", "yellow", "orange", "red"] as const;
export type OrderPriorityToken = (typeof ORDER_PRIORITY_KEYS)[number];

export const ORDER_PRIORITY_LABELS_PL: Record<OrderPriorityToken, string> = {
  gray: "Neutralny",
  blue: "Info",
  green: "Sukces",
  yellow: "Ostrzeżenie",
  orange: "Pilne",
  red: "Krytyczne",
};

export function normalizePriorityToken(raw: string | null | undefined): OrderPriorityToken | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  return (ORDER_PRIORITY_KEYS as readonly string[]).includes(s) ? (s as OrderPriorityToken) : null;
}

export function priorityFlameTextClass(token: string | null | undefined): string {
  const t = normalizePriorityToken(token);
  if (!t) return "text-slate-300";
  const map: Record<OrderPriorityToken, string> = {
    gray: "text-slate-400",
    blue: "text-blue-600",
    green: "text-emerald-600",
    yellow: "text-yellow-500",
    orange: "text-orange-500",
    red: "text-red-600",
  };
  return map[t];
}

/** Tło przycisku w pickerze — subtelne, rozpoznawalne. */
export function prioritySwatchSurfaceClass(token: OrderPriorityToken): string {
  const map: Record<OrderPriorityToken, string> = {
    gray: "border-slate-200 bg-slate-50 hover:bg-slate-100",
    blue: "border-blue-200 bg-blue-50 hover:bg-blue-100",
    green: "border-emerald-200 bg-emerald-50 hover:bg-emerald-100",
    yellow: "border-yellow-200 bg-yellow-50 hover:bg-yellow-100",
    orange: "border-orange-200 bg-orange-50 hover:bg-orange-100",
    red: "border-red-200 bg-red-50 hover:bg-red-100",
  };
  return map[token];
}

/** Wąski pasek priorytetu przy checkboxie — neutralny gdy brak znacznika. */
export function priorityStripeBarClass(raw: string | null | undefined): string {
  const t = normalizePriorityToken(raw);
  if (!t) return "bg-slate-200/80";
  const map: Record<OrderPriorityToken, string> = {
    gray: "bg-slate-400",
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    yellow: "bg-yellow-400",
    orange: "bg-orange-500",
    red: "bg-red-500",
  };
  return map[t];
}
