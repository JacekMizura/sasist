/**
 * Polish UI labels for machine-readable order / WMS event codes.
 * Raw keys stay in API, logs, and dev tooltips only.
 */

export type OrderEventCategory =
  | "system"
  | "warehouse"
  | "shortage"
  | "order_change"
  | "recovery"
  | "relocation"
  | "packing";

export const ORDER_EVENT_CATEGORY_LABELS: Record<OrderEventCategory, string> = {
  system: "System",
  warehouse: "Operacje magazynowe",
  shortage: "Braki",
  order_change: "Zmiany zamówienia",
  recovery: "Dogrywka zbierki",
  relocation: "Rozlokowanie produktów",
  packing: "Pakowanie",
};

/** Canonical Polish labels — keys are normalized UPPER_SNAKE. */
export const ORDER_EVENT_LABELS: Record<string, string> = {
  SYSTEM: "System",
  SOURCE: "Źródło",

  PICKING_STARTED: "Rozpoczęto zbieranie",
  PICKING_FINISHED: "Zakończono zbieranie",
  PICKED_ITEM: "Zebrano produkt",

  SHORTAGE_REPORTED: "Zgłoszono brak",
  ORDER_LINE_SHORTAGE_REPORTED: "Zgłoszono brak",
  REPLACEMENT_SHORTAGE_REPORTED: "Zgłoszono brak (zamiennik)",
  RECOVERY_SHORTAGE_REPORTED: "Zgłoszono brak (dogrywka)",
  ORDER_DETACHED_AFTER_SHORTAGE_FINALIZE: "Odłączono od wózka (braki)",

  OMS_DECISION_WAIT: "OMS: oczekuje na decyzję",
  OMS_DECISION_ACCEPTED: "Zaakceptowano decyzję OMS",

  ORDER_LINE_REPLACED: "Zamieniono produkt",
  ORDER_ITEM_REMOVED: "Usunięto pozycję",
  ORDER_LINE_REMOVED: "Usunięto linię zamówienia",
  REPLACEMENT_ITEM_REMOVED: "Usunięto zamiennik",

  RECOVERY_STARTED: "Rozpoczęto dogrywkę",
  RECOVERY_FINISHED: "Zakończono dogrywkę",

  RELOCATION_CREATED: "Utworzono rozlokowanie produktów",
  RELOCATION_FINISHED: "Zakończono rozlokowanie produktów",
  RELOCATION_STARTED: "Rozpoczęto rozlokowanie produktów",

  PACKING_STARTED: "Rozpoczęto pakowanie",
  PACKING_FINISHED: "Zakończono pakowanie",
  PACKING_PAUSED: "Wstrzymano pakowanie",
  PACKING_RESUMED: "Wznowiono pakowanie",
  PACKING_AUTOMATION_FINISHED: "Zakończono automatykę pakowania",
  PACKED_ITEM: "Spakowano produkt",
  PACKED: "Spakowano produkt",

  CARTON_SELECTED: "Wybrano karton",
  CARTON_CHANGED: "Zmieniono karton",
  LABEL_GENERATED: "Wygenerowano etykietę",
  LABEL_REPRINTED: "Ponownie wydrukowano etykietę",
  PACKAGE_WEIGHT_CONFIRMED: "Potwierdzono wagę przesyłki",

  LOCATION_CHANGED: "Zmieniono lokalizację",
  RESERVATION_CREATED: "Utworzono rezerwację",
  RESERVATION_RELEASED: "Zwolniono rezerwację",

  NOTE: "Notatka",
  NOTE_ADDED: "Dodano notatkę",

  FE_PICK: "Zebrano produkt",
  FE_MISSING: "Zgłoszono brak",
  FE_REMOVED: "Usunięto pozycję",
  FE_REPLACED: "Zamieniono produkt",
  FE_WAITING: "Oczekuje na towar",
};

const ORDER_EVENT_CATEGORIES: Record<string, OrderEventCategory> = {
  SYSTEM: "system",
  SOURCE: "system",
  NOTE: "system",
  NOTE_ADDED: "system",

  PICKING_STARTED: "warehouse",
  PICKING_FINISHED: "warehouse",
  PICKED_ITEM: "warehouse",
  FE_PICK: "warehouse",
  LOCATION_CHANGED: "warehouse",
  RESERVATION_CREATED: "warehouse",
  RESERVATION_RELEASED: "warehouse",

  SHORTAGE_REPORTED: "shortage",
  ORDER_LINE_SHORTAGE_REPORTED: "shortage",
  REPLACEMENT_SHORTAGE_REPORTED: "shortage",
  RECOVERY_SHORTAGE_REPORTED: "shortage",
  FE_MISSING: "shortage",
  OMS_DECISION_WAIT: "shortage",
  OMS_DECISION_ACCEPTED: "shortage",
  FE_WAITING: "shortage",

  ORDER_LINE_REPLACED: "order_change",
  ORDER_ITEM_REMOVED: "order_change",
  ORDER_LINE_REMOVED: "order_change",
  REPLACEMENT_ITEM_REMOVED: "order_change",
  FE_REMOVED: "order_change",
  FE_REPLACED: "order_change",

  RECOVERY_STARTED: "recovery",
  RECOVERY_FINISHED: "recovery",

  RELOCATION_CREATED: "relocation",
  RELOCATION_FINISHED: "relocation",
  RELOCATION_STARTED: "relocation",

  PACKING_STARTED: "packing",
  PACKING_FINISHED: "packing",
  PACKING_PAUSED: "packing",
  PACKING_RESUMED: "packing",
  PACKING_AUTOMATION_FINISHED: "packing",
  PACKED_ITEM: "packing",
  PACKED: "packing",
  CARTON_SELECTED: "packing",
  CARTON_CHANGED: "packing",
  LABEL_GENERATED: "packing",
  LABEL_REPRINTED: "packing",
  PACKAGE_WEIGHT_CONFIRMED: "packing",
};

export type OrderEventVisualTone =
  | "pick"
  | "shortage"
  | "replace"
  | "remove"
  | "relocation"
  | "packing"
  | "recovery"
  | "system"
  | "neutral";

export type OrderEventDisplay = {
  rawKey: string;
  label: string;
  category: OrderEventCategory;
  categoryLabel: string;
  icon: string;
  tone: OrderEventVisualTone;
  textClass: string;
  bgClass: string;
};

const TONE_STYLES: Record<OrderEventVisualTone, { textClass: string; bgClass: string }> = {
  pick: { textClass: "text-emerald-800", bgClass: "bg-emerald-50" },
  shortage: { textClass: "text-amber-900", bgClass: "bg-amber-50" },
  replace: { textClass: "text-blue-800", bgClass: "bg-blue-50" },
  remove: { textClass: "text-rose-800", bgClass: "bg-rose-50" },
  relocation: { textClass: "text-violet-800", bgClass: "bg-violet-50" },
  packing: { textClass: "text-indigo-800", bgClass: "bg-indigo-50" },
  recovery: { textClass: "text-cyan-800", bgClass: "bg-cyan-50" },
  system: { textClass: "text-slate-700", bgClass: "bg-slate-50" },
  neutral: { textClass: "text-slate-800", bgClass: "bg-slate-50" },
};

function toneForKey(key: string, category: OrderEventCategory): OrderEventVisualTone {
  if (key.includes("SHORTAGE") || key.includes("MISSING") || key === "FE_MISSING") return "shortage";
  if (key.includes("REPLACED") || key === "FE_REPLACED") return "replace";
  if (key.includes("REMOVED") || key === "FE_REMOVED") return "remove";
  if (key.includes("RELOCATION")) return "relocation";
  if (key.includes("PACK") || key.includes("CARTON") || key.includes("LABEL") || key.includes("WEIGHT"))
    return "packing";
  if (key.includes("RECOVERY")) return "recovery";
  if (key.includes("PICK") || key === "FE_PICK") return "pick";
  if (category === "system") return "system";
  return "neutral";
}

function iconForTone(tone: OrderEventVisualTone): string {
  switch (tone) {
    case "pick":
      return "🟢";
    case "shortage":
      return "🟠";
    case "replace":
      return "🔵";
    case "remove":
      return "🔴";
    case "relocation":
      return "🟣";
    case "packing":
      return "📦";
    case "recovery":
      return "🔄";
    case "system":
      return "⚙️";
    default:
      return "•";
  }
}

export function normalizeOrderEventKey(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

/** Title-case words — never show raw SCREAMING_SNAKE in UI. */
export function formatOrderEventKeyFallback(key: string): string {
  const k = normalizeOrderEventKey(key);
  if (!k) return "Zdarzenie";
  return k
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function getOrderEventLabel(code: string | null | undefined): string {
  const k = normalizeOrderEventKey(code);
  if (!k) return "Zdarzenie";
  return ORDER_EVENT_LABELS[k] ?? formatOrderEventKeyFallback(k);
}

export function getOrderEventCategory(code: string | null | undefined): OrderEventCategory {
  const k = normalizeOrderEventKey(code);
  if (!k) return "system";
  return ORDER_EVENT_CATEGORIES[k] ?? "warehouse";
}

export function getOrderEventCategoryLabel(code: string | null | undefined): string {
  return ORDER_EVENT_CATEGORY_LABELS[getOrderEventCategory(code)];
}

export function getOrderEventDisplay(code: string | null | undefined): OrderEventDisplay {
  const rawKey = normalizeOrderEventKey(code);
  const category = getOrderEventCategory(rawKey);
  const label = getOrderEventLabel(rawKey);
  const tone = toneForKey(rawKey, category);
  const styles = TONE_STYLES[tone];
  return {
    rawKey,
    label,
    category,
    categoryLabel: ORDER_EVENT_CATEGORY_LABELS[category],
    icon: iconForTone(tone),
    tone,
    textClass: styles.textClass,
    bgClass: styles.bgClass,
  };
}

/** Dev-only tooltip with machine code. */
export function orderEventDevTitle(code: string | null | undefined, label: string): string | undefined {
  if (!import.meta.env.DEV) return undefined;
  const k = normalizeOrderEventKey(code);
  if (!k || k === label) return k || undefined;
  return `${label} (${k})`;
}
