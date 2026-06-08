import type { InventoryDocumentRead } from "@/api/inventoryCountApi";
import { formatInventoryApiError } from "./inventoryCountApiErrors";

export function inventorySubmitBlockHint(doc: InventoryDocumentRead | null | undefined): string | undefined {
  if (!doc?.submit_readiness || doc.submit_readiness.can_submit) return undefined;
  return (
    formatInventoryApiError({
      code: doc.submit_readiness.block_code ?? undefined,
      message: doc.submit_readiness.block_message ?? undefined,
      details: doc.submit_readiness.details,
    }) || undefined
  );
}

export function canSubmitInventoryDocument(doc: InventoryDocumentRead | null | undefined): boolean {
  if (!doc || doc.status !== "in_progress") return false;
  if (doc.submit_readiness) return doc.submit_readiness.can_submit;
  const partial = String(doc.inventory_type ?? "FULL").toUpperCase() === "PARTIAL";
  if (partial) return doc.counted_lines > 0;
  return doc.total_lines > 0 && doc.counted_lines >= doc.total_lines;
}
