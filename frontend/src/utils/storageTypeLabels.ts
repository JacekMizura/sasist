import { formatWarehouseLocationTypeLabel } from "./warehouseLocationTypeLabels";

export function getStorageTypeLabel(type: string | null | undefined): string {
  if (!type) return "Nieznany";
  const raw = String(type).trim();
  if (!raw) return "Nieznany";
  if (raw.toLowerCase() === "mixed") return "Mieszane (PODSTAWOWA + ZAPAS)";
  return formatWarehouseLocationTypeLabel(raw);
}
