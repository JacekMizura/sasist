/**
 * Polish UI labels for machine-readable order / WMS event codes.
 * Raw keys stay in API, logs, and dev tooltips only.
 *
 * Display labels SSOT: ``eventDisplayLabels.ts`` → getEventDisplayLabel.
 */

import {
  EVENT_DISPLAY_LABELS,
  UNKNOWN_EVENT_LABEL,
  getEventDisplayLabel,
  normalizeEventCode,
} from "./eventDisplayLabels";

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

/** @deprecated Prefer EVENT_DISPLAY_LABELS / getEventDisplayLabel — kept for category lookups. */
export const ORDER_EVENT_LABELS: Record<string, string> = {
  SYSTEM: EVENT_DISPLAY_LABELS.SYSTEM,
  SOURCE: EVENT_DISPLAY_LABELS.SOURCE,
  PICKING_STARTED: EVENT_DISPLAY_LABELS.PICKING_STARTED,
  PICKING_FINISHED: EVENT_DISPLAY_LABELS.PICKING_FINISHED,
  PICKED_ITEM: EVENT_DISPLAY_LABELS.PICKED_ITEM,
  SHORTAGE_REPORTED: EVENT_DISPLAY_LABELS.SHORTAGE_REPORTED,
  ORDER_LINE_SHORTAGE_REPORTED: EVENT_DISPLAY_LABELS.ORDER_LINE_SHORTAGE_REPORTED,
  REPLACEMENT_SHORTAGE_REPORTED: EVENT_DISPLAY_LABELS.REPLACEMENT_SHORTAGE_REPORTED,
  RECOVERY_SHORTAGE_REPORTED: EVENT_DISPLAY_LABELS.RECOVERY_SHORTAGE_REPORTED,
  ORDER_DETACHED_AFTER_SHORTAGE_FINALIZE: EVENT_DISPLAY_LABELS.ORDER_DETACHED_AFTER_SHORTAGE_FINALIZE,
  OMS_DECISION_WAIT: EVENT_DISPLAY_LABELS.OMS_DECISION_WAIT,
  OMS_DECISION_ACCEPTED: EVENT_DISPLAY_LABELS.OMS_DECISION_ACCEPTED,
  ORDER_LINE_REPLACED: EVENT_DISPLAY_LABELS.ORDER_LINE_REPLACED,
  ORDER_ITEM_REMOVED: EVENT_DISPLAY_LABELS.ORDER_ITEM_REMOVED,
  ORDER_LINE_REMOVED: EVENT_DISPLAY_LABELS.ORDER_LINE_REMOVED,
  REPLACEMENT_ITEM_REMOVED: EVENT_DISPLAY_LABELS.REPLACEMENT_ITEM_REMOVED,
  RECOVERY_STARTED: EVENT_DISPLAY_LABELS.RECOVERY_STARTED,
  RECOVERY_FINISHED: EVENT_DISPLAY_LABELS.RECOVERY_FINISHED,
  RELOCATION_CREATED: EVENT_DISPLAY_LABELS.RELOCATION_CREATED,
  RELOCATION_FINISHED: EVENT_DISPLAY_LABELS.RELOCATION_FINISHED,
  RELOCATION_STARTED: EVENT_DISPLAY_LABELS.RELOCATION_STARTED,
  PACKING_STARTED: EVENT_DISPLAY_LABELS.PACKING_STARTED,
  PACKING_FINISHED: EVENT_DISPLAY_LABELS.PACKING_FINISHED,
  PACKING_PAUSED: EVENT_DISPLAY_LABELS.PACKING_PAUSED,
  PACKING_RESUMED: EVENT_DISPLAY_LABELS.PACKING_RESUMED,
  PACKING_AUTOMATION_FINISHED: EVENT_DISPLAY_LABELS.PACKING_AUTOMATION_FINISHED,
  PACKED_ITEM: EVENT_DISPLAY_LABELS.PACKED_ITEM,
  PACKED: EVENT_DISPLAY_LABELS.PACKED,
  CARTON_SELECTED: EVENT_DISPLAY_LABELS.CARTON_SELECTED,
  CARTON_CHANGED: EVENT_DISPLAY_LABELS.CARTON_CHANGED,
  LABEL_GENERATED: EVENT_DISPLAY_LABELS.LABEL_GENERATED,
  LABEL_REPRINTED: EVENT_DISPLAY_LABELS.LABEL_REPRINTED,
  PACKAGE_WEIGHT_CONFIRMED: EVENT_DISPLAY_LABELS.PACKAGE_WEIGHT_CONFIRMED,
  LOCATION_CHANGED: EVENT_DISPLAY_LABELS.LOCATION_CHANGED,
  RESERVATION_CREATED: EVENT_DISPLAY_LABELS.RESERVATION_CREATED,
  RESERVATION_RELEASED: EVENT_DISPLAY_LABELS.RESERVATION_RELEASED,
  NOTE: EVENT_DISPLAY_LABELS.NOTE,
  NOTE_ADDED: EVENT_DISPLAY_LABELS.NOTE_ADDED,
  FE_PICK: EVENT_DISPLAY_LABELS.FE_PICK,
  FE_MISSING: EVENT_DISPLAY_LABELS.FE_MISSING,
  FE_REMOVED: EVENT_DISPLAY_LABELS.FE_REMOVED,
  FE_REPLACED: EVENT_DISPLAY_LABELS.FE_REPLACED,
  FE_WAITING: EVENT_DISPLAY_LABELS.FE_WAITING,
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
  return normalizeEventCode(code);
}

/** @deprecated Unknown codes must never become English title-case — use UNKNOWN_EVENT_LABEL. */
export function formatOrderEventKeyFallback(_key: string): string {
  return UNKNOWN_EVENT_LABEL;
}

export function getOrderEventLabel(code: string | null | undefined): string {
  return getEventDisplayLabel(code);
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
