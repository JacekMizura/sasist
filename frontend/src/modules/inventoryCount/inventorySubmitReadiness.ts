import type { InventoryDocumentRead } from "@/api/inventoryCountApi";

export function inventorySubmitBlockHint(doc: InventoryDocumentRead | null | undefined): string | undefined {
  if (!doc?.submit_readiness || doc.submit_readiness.can_submit) return undefined;
  const msg = doc.submit_readiness.block_message?.trim();
  if (msg) return msg;
  return undefined;
}

/** Submit allowed when ≥1 counted line and no operator recount conflicts (backend SSOT). */
export function canSubmitInventoryDocument(doc: InventoryDocumentRead | null | undefined): boolean {
  if (!doc || doc.status !== "in_progress") return false;
  if (doc.submit_readiness) return doc.submit_readiness.can_submit;
  return doc.counted_lines > 0;
}
