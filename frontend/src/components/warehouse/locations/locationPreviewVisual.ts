import type { LocationVisualBin } from "../../../api/wmsLocationVisualApi";
import type { NormalizedStorageType } from "../../../types/warehouse";

export type LocationSlotVisualKind = "active" | "primary" | "reserve" | "blocked" | "empty";

export const LOCATION_SLOT_COLORS: Record<
  LocationSlotVisualKind,
  { bg: string; border: string; text: string; label: string }
> = {
  active: { bg: "#2563eb", border: "#1d4ed8", text: "#ffffff", label: "Aktualna lokalizacja" },
  primary: { bg: "#dcfce7", border: "#16a34a", text: "#14532d", label: "Podstawowa" },
  reserve: { bg: "#fef9c3", border: "#ca8a04", text: "#713f12", label: "Zapas" },
  blocked: { bg: "#fee2e2", border: "#dc2626", text: "#7f1d1d", label: "Blokada" },
  empty: { bg: "#f1f5f9", border: "#cbd5e1", text: "#64748b", label: "Pusta" },
};

export function storageTypeLabelPl(storageType?: string | null, locationKind?: string | null): string {
  const st = (storageType || "").trim().toLowerCase();
  if (st === "reserve" || st === "buffer") return "Zapas";
  if (st === "damaged" || st === "blocked") return "Blokada";
  if (st === "primary" || st === "pick") return "Podstawowa";
  const kind = (locationKind || "").trim().toUpperCase();
  if (kind === "BUFFER") return "Zapas";
  if (kind === "PICK") return "Podstawowa";
  if (kind === "BULK") return "Masowa";
  return "Lokalizacja";
}

export function resolveSlotVisualKind(args: {
  isActive: boolean;
  isBlocked?: boolean;
  isEmpty?: boolean;
  storageType?: string | null;
}): LocationSlotVisualKind {
  if (args.isActive) return "active";
  if (args.isBlocked) return "blocked";
  const st = (args.storageType || "").trim().toLowerCase() as NormalizedStorageType | string;
  if (st === "damaged" || st === "blocked") return "blocked";
  if (args.isEmpty) return "empty";
  if (st === "reserve" || st === "buffer") return "reserve";
  return "primary";
}

export function binHoverLines(bin: Pick<
  LocationVisualBin,
  "code" | "storage_type" | "location_kind" | "carrier_code" | "sku" | "quantity" | "is_empty" | "is_blocked"
>): string[] {
  const type = bin.is_blocked
    ? "Blokada"
    : bin.is_empty
      ? "Pusta"
      : storageTypeLabelPl(bin.storage_type, bin.location_kind);
  return [
    `Kod: ${bin.code || "—"}`,
    `Typ: ${type}`,
    `Nośnik: ${bin.carrier_code?.trim() || "—"}`,
    `SKU: ${bin.sku?.trim() || "—"}`,
    `Ilość: ${bin.is_empty ? "0" : String(bin.quantity ?? 0)}`,
  ];
}
