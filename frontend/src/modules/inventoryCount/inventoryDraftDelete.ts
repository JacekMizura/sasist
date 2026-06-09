import type { InventoryDocumentRead } from "@/api/inventoryCountApi";

/** Draft documents that the ERP list may offer for hard-delete (backend re-validates). */
export function isInventoryDraftDeletable(doc: InventoryDocumentRead): boolean {
  return doc.status === "draft" && !doc.started_at;
}
