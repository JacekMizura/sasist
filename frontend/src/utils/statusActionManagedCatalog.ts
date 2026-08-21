/**
 * Shared STATUS_ACTION managed-effect catalog for StatusActionsPanel + status list overview.
 * Backend SSOT remains AutomationRule; these are display/projection keys only.
 */
import type { AutomationEntityType } from "../api/automationsApi";

export type StatusActionManagedKey =
  | "warehouse_commit"
  | "send_email_customer"
  | "send_email_internal";

/** Checkbox labels in the compact status modal. */
export const STATUS_ACTION_CHECKBOX_LABELS: Record<StatusActionManagedKey, string> = {
  warehouse_commit: "Zatwierdź przyjęcie w magazynie",
  send_email_customer: "Wyślij e-mail klientowi",
  send_email_internal: "Wyślij e-mail wewnętrzny",
};

/** Short business labels on the status list overview. */
export const STATUS_ACTION_LIST_LABELS: Record<StatusActionManagedKey, string> = {
  warehouse_commit: "Przyjęcie magazynowe",
  send_email_customer: "E-mail klientowi",
  send_email_internal: "E-mail wewnętrzny",
};

export const WAREHOUSE_COMMIT_TOOLTIP =
  "Finalizuje przyjęcie zwrotu przez istniejący workflow RMZ i tworzy Z-PZ, jeśli operacja jest możliwa.";

export function managedKeysForEntity(entityType: AutomationEntityType): StatusActionManagedKey[] {
  if (entityType === "RETURN") {
    return ["warehouse_commit", "send_email_customer", "send_email_internal"];
  }
  return ["send_email_customer", "send_email_internal"];
}
