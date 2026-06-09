/** Polskie etykiety UI — struktura magazynu (bez nazw technicznych w interfejsie). */

export type CapacityMode = "volume" | "orders" | "mixed";

export const CAPACITY_MODE_OPTIONS: { value: CapacityMode; label: string; hint: string }[] = [
  { value: "volume", label: "Objętość", hint: "Limit wg zajętej objętości (dm³)" },
  { value: "orders", label: "Zamówienia", hint: "Limit wg liczby przypisanych zamówień" },
  { value: "mixed", label: "Mieszany", hint: "Oba limity muszą być spełnione" },
];

export function capacityModeLabel(mode: string | null | undefined): string {
  const m = (mode || "volume").toLowerCase() as CapacityMode;
  return CAPACITY_MODE_OPTIONS.find((o) => o.value === m)?.label ?? "Objętość";
}

const CARRIER_STATUS_PL: Record<string, string> = {
  ACTIVE: "Aktywny",
  INBOUND: "Przyjęcie",
  PUTAWAY: "Rozlokowanie",
  PICKING: "Kompletacja",
  PACKING: "Pakowanie",
  SHIPPING: "Wysyłka",
  BLOCKED: "Zablokowany",
  DAMAGED: "Uszkodzony",
  ARCHIVED: "Zarchiwizowany",
  EMPTY: "Pusty",
  INACTIVE: "Nieaktywny",
};

export function carrierStatusLabel(status: string | null | undefined): string {
  const key = (status || "ACTIVE").trim().toUpperCase();
  return CARRIER_STATUS_PL[key] ?? key.replace(/_/g, " ").toLowerCase();
}

export function formatScanCodeLabel(scanCode: string | null | undefined): string {
  const raw = (scanCode || "").trim();
  if (!raw) return "—";
  return raw.replace(/^ESP:/i, "Kod terminala: ");
}
