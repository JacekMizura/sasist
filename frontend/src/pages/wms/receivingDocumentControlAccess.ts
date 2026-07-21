import { isSuperRole } from "../../auth/isSuperRole";

/** RBAC: podgląd ilości z dokumentu / różnicy przy przyjęciu (nie blind count). */
export const WMS_RECEIVING_DOCUMENT_CONTROL_PERMISSION = "warehouse.receipts.control";

/**
 * Czy użytkownik może widzieć oczekiwane ilości i różnice przy przyjęciu PZ.
 * Operator bez tego permission wykonuje blind receiving.
 */
export function canViewReceivingDocumentControl(
  hasPermission: (key: string) => boolean,
  role?: string | null,
): boolean {
  if (isSuperRole(role)) return true;
  return hasPermission(WMS_RECEIVING_DOCUMENT_CONTROL_PERMISSION);
}
