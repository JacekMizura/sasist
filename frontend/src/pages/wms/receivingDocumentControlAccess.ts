import { isSuperRole } from "../../auth/isSuperRole";

/**
 * RBAC: podgląd ilości z dokumentu / różnicy (nie blind count).
 * Operacyjny ekran WMS Przyjęć zawsze wymusza blind — to permission zostaje
 * dla ewentualnych widoków kontrolnych poza receiving floor.
 */
export const WMS_RECEIVING_DOCUMENT_CONTROL_PERMISSION = "warehouse.receipts.control";

/**
 * Czy użytkownik może widzieć oczekiwane ilości i różnice.
 * Uwaga: WMS Receiving Count Page nie używa tego do pokazywania qty dokumentu.
 */
export function canViewReceivingDocumentControl(
  hasPermission: (key: string) => boolean,
  role?: string | null,
): boolean {
  if (isSuperRole(role)) return true;
  return hasPermission(WMS_RECEIVING_DOCUMENT_CONTROL_PERMISSION);
}
