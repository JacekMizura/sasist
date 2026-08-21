/**
 * Shared STATUS_ACTION managed-effect catalog for matrix + StatusActionsPanel.
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

/** Compact column headers for the status actions matrix. */
export const STATUS_ACTION_COLUMN_HEADERS: Record<StatusActionManagedKey, string> = {
  warehouse_commit: "Magazyn",
  send_email_customer: "E-mail klient",
  send_email_internal: "E-mail wewn.",
};

/** Full titles for column header tooltips. */
export const STATUS_ACTION_COLUMN_TOOLTIPS: Record<StatusActionManagedKey, string> = {
  warehouse_commit:
    "Finalizuje przyjęcie zwrotu przez workflow RMZ i tworzy Z-PZ, jeśli zwrot jest gotowy.",
  send_email_customer: "Wyślij e-mail klientowi po wejściu w ten status",
  send_email_internal: "Wyślij e-mail wewnętrzny po wejściu w ten status",
};

export const WAREHOUSE_COMMIT_TOOLTIP = STATUS_ACTION_COLUMN_TOOLTIPS.warehouse_commit;

export function managedKeysForEntity(entityType: AutomationEntityType): StatusActionManagedKey[] {
  if (entityType === "RETURN") {
    return ["warehouse_commit", "send_email_customer", "send_email_internal"];
  }
  return ["send_email_customer", "send_email_internal"];
}
