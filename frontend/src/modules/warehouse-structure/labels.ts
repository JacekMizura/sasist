/** Polskie etykiety UI — struktura magazynu (bez nazw technicznych w interfejsie). */

import {
  CAPACITY_STRATEGY_OPTIONS,
  type CapacityStrategyValue,
} from "../../types/cartCapacity";

export function capacityStrategyLabel(strategy: string | null | undefined): string {
  const key = String(strategy ?? "").trim().toUpperCase();
  const opt = CAPACITY_STRATEGY_OPTIONS.find((o) => o.value === key);
  return opt?.label ?? (key || "—");
}

export type { CapacityStrategyValue };

const CARRIER_STATUS_PL: Record<string, string> = {
  ACTIVE: "Aktywny",
  INBOUND: "Przyjęcie",
  PUTAWAY: "Odkładanie",
  PICKING: "Kompletacja",
  PACKING: "Pakowanie",
  SHIPPING: "Wysyłka",
  BLOCKED: "Zablokowany",
  DAMAGED: "Uszkodzony",
  ARCHIVED: "Archiwalny",
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
