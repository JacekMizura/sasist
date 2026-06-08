import type { InventoryDocumentRead } from "@/api/inventoryCountApi";

const SCOPED_INVENTORY_TYPES = new Set(["PARTIAL", "CYCLE", "CONTROL"]);

export function isScopedInventoryType(inventoryType: unknown): boolean {
  return SCOPED_INVENTORY_TYPES.has(String(inventoryType ?? "FULL").trim().toUpperCase());
}

export function inventorySubmitBlockHint(doc: InventoryDocumentRead | null | undefined): string | undefined {
  if (!doc?.submit_readiness || doc.submit_readiness.can_submit) return undefined;
  const msg = doc.submit_readiness.block_message?.trim();
  if (msg) return msg;
  return undefined;
}

export function canSubmitInventoryDocument(doc: InventoryDocumentRead | null | undefined): boolean {
  if (!doc || doc.status !== "in_progress") return false;
  if (doc.submit_readiness) return doc.submit_readiness.can_submit;
  if (isScopedInventoryType(doc.inventory_type)) return doc.counted_lines > 0;
  return doc.total_lines > 0 && doc.counted_lines >= doc.total_lines;
}
