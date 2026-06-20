import type { InventoryDocumentRead } from "@/api/inventoryCountApi";
import { inventoryDocumentStatusLabel, inventoryTypeLabel } from "./inventoryCountUiLabels";

export type InventoryDocumentListFilters = {
  query: string;
  status: string;
  type: string;
};

export const DEFAULT_INVENTORY_DOCUMENT_LIST_FILTERS: InventoryDocumentListFilters = {
  query: "",
  status: "",
  type: "",
};

export function countActiveInventoryDocumentFilters(filters: InventoryDocumentListFilters): number {
  let n = 0;
  if (filters.query.trim()) n += 1;
  if (filters.status) n += 1;
  if (filters.type) n += 1;
  return n;
}

export function inventoryDocumentListFilterLabel(filters: InventoryDocumentListFilters): string {
  const parts: string[] = [];
  if (filters.status) parts.push(inventoryDocumentStatusLabel(filters.status));
  if (filters.type) parts.push(inventoryTypeLabel(filters.type));
  if (filters.query.trim()) parts.push(`„${filters.query.trim()}”`);
  return parts.length ? parts.join(" · ") : "Wszystkie dokumenty";
}

export function filterInventoryDocuments(
  rows: InventoryDocumentRead[],
  filters: InventoryDocumentListFilters,
): InventoryDocumentRead[] {
  const q = filters.query.trim().toLowerCase();
  return rows.filter((doc) => {
    if (filters.status && doc.status !== filters.status) return false;
    if (filters.type && doc.inventory_type !== filters.type) return false;
    if (q) {
      const hay = [doc.number, doc.title, inventoryTypeLabel(doc.inventory_type), inventoryDocumentStatusLabel(doc.status)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export const INVENTORY_DOCUMENT_STATUS_FILTER_OPTIONS = [
  { value: "", label: "Wszystkie statusy" },
  { value: "draft", label: "Wersja robocza" },
  { value: "planned", label: "Zaplanowana" },
  { value: "in_progress", label: "W trakcie" },
  { value: "awaiting_approval", label: "Do zatwierdzenia" },
  { value: "approved", label: "Zatwierdzona" },
  { value: "posted", label: "Zaksięgowana" },
  { value: "cancelled", label: "Anulowana" },
] as const;

export const INVENTORY_DOCUMENT_TYPE_FILTER_OPTIONS = [
  { value: "", label: "Wszystkie typy" },
  { value: "FULL", label: "Pełna" },
  { value: "PARTIAL", label: "Częściowa" },
  { value: "CYCLE", label: "Rotacyjna" },
  { value: "CONTROL", label: "Kontrolna" },
] as const;
