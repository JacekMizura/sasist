import { carrierStatusLabel } from "../../../modules/warehouse-structure/labels";

export const CARRIER_PREFIXES = ["PAL", "BOX", "BIN", "CRT", "MIX"] as const;

export type CarrierPrefix = (typeof CARRIER_PREFIXES)[number];

/**
 * Globalny design token nośnika (SASIST).
 * Jedyne źródło prawdy dla kolorystyki — wszystkie typy nośników są FIOLETOWE.
 * Ikony/etykiety typów mogą się różnić; kolory nigdy.
 */
export const CARRIER_VISUAL = {
  bg: "#f5f3ff",
  border: "#c4b5fd",
  fg: "#6d28d9",
  /** Mocniejszy akcent (ikona w badge, selected). */
  accent: "#7c3aed",
  selectedBg: "#ede9fe",
  selectedBorder: "#8b5cf6",
  selectedFg: "#5b21b6",
} as const;

/** Tailwind classes for carrier chrome (bars, selection cards) — keep in sync with CARRIER_VISUAL. */
export const carrierVisualClasses = {
  surface: "border-violet-200 bg-violet-50 text-violet-900",
  surfaceSelected: "border-violet-500 bg-violet-100 text-violet-950 shadow-sm ring-1 ring-violet-300/50",
  surfaceIdle: "border-slate-100 bg-white text-slate-700 hover:border-violet-200",
  iconIdle: "bg-violet-100 text-violet-700",
  iconSelected: "bg-violet-200 text-violet-800",
  bar: "border border-violet-200/70 bg-violet-50",
  barLabel: "text-violet-700/80",
  barIcon: "text-violet-600",
  barDivider: "border-violet-200/60",
  barAction: "rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-[11px] font-bold text-violet-900 shadow-sm transition-colors hover:bg-violet-100 disabled:opacity-50",
  monoChip: "inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-0.5 font-mono text-[11px] font-bold text-violet-900",
} as const;

export type CarrierPrefixMeta = {
  label: string;
  icon: string;
  bg: string;
  border: string;
  fg: string;
};

function prefixMeta(label: string, icon: string): CarrierPrefixMeta {
  return {
    label,
    icon,
    bg: CARRIER_VISUAL.bg,
    border: CARRIER_VISUAL.border,
    fg: CARRIER_VISUAL.fg,
  };
}

/** Prefix → label/icon; kolory zawsze z ``CARRIER_VISUAL``. */
export const CARRIER_PREFIX_META: Record<CarrierPrefix, CarrierPrefixMeta> = {
  PAL: prefixMeta("Paleta", "PL"),
  BOX: prefixMeta("Karton", "BX"),
  BIN: prefixMeta("Pojemnik", "BN"),
  CRT: prefixMeta("Wózek", "CR"),
  MIX: prefixMeta("Mix", "MX"),
};

export function carrierPrefixMeta(prefix: string): CarrierPrefixMeta | null {
  const key = (prefix || "").trim().toUpperCase() as CarrierPrefix;
  return CARRIER_PREFIX_META[key] ?? null;
}

/** Kolory nośnika niezależnie od prefixu (nieznany typ też fioletowy). */
export function carrierVisualStyle(): Pick<CarrierPrefixMeta, "bg" | "border" | "fg"> {
  return {
    bg: CARRIER_VISUAL.bg,
    border: CARRIER_VISUAL.border,
    fg: CARRIER_VISUAL.fg,
  };
}

export const CARRIER_CREATE_STATUSES = [
  "ACTIVE",
  "EMPTY",
  "INBOUND",
  "PUTAWAY",
  "PICKING",
  "PACKING",
  "SHIPPING",
  "BLOCKED",
  "DAMAGED",
  "ARCHIVED",
] as const;

export function carrierStatusOptions() {
  return CARRIER_CREATE_STATUSES.map((s) => ({
    value: s,
    label: carrierStatusLabel(s),
  }));
}

/** Domyślny padding zer w wyświetlaniu kodów (0 = PAL-10). Ustaw 6 dla PAL-000010. */
export const CARRIER_CODE_DISPLAY_ZERO_PAD = 0;
