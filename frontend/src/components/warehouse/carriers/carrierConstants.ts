import { carrierStatusLabel } from "../../../modules/warehouse-structure/labels";

export const CARRIER_PREFIXES = ["PAL", "BOX", "BIN", "CRT", "MIX"] as const;

export type CarrierPrefix = (typeof CARRIER_PREFIXES)[number];

export const CARRIER_PREFIX_META: Record<
  CarrierPrefix,
  { label: string; icon: string; bg: string; border: string; fg: string }
> = {
  PAL: { label: "Paleta", icon: "PL", bg: "#eff6ff", border: "#bfdbfe", fg: "#1d4ed8" },
  BOX: { label: "Karton", icon: "BX", bg: "#fef3c7", border: "#fcd34d", fg: "#b45309" },
  BIN: { label: "Pojemnik", icon: "BN", bg: "#ecfdf5", border: "#6ee7b7", fg: "#047857" },
  CRT: { label: "Wózek", icon: "CR", bg: "#f5f3ff", border: "#c4b5fd", fg: "#6d28d9" },
  MIX: { label: "Mix", icon: "MX", bg: "#fdf4ff", border: "#e9d5ff", fg: "#86198f" },
};

export function carrierPrefixMeta(prefix: string) {
  const key = (prefix || "").trim().toUpperCase() as CarrierPrefix;
  return CARRIER_PREFIX_META[key] ?? null;
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
