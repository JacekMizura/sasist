/**
 * Shared STATUS_ACTION managed-effect catalog for matrix + StatusActionsPanel.
 * Backend SSOT remains AutomationRule; these are display/projection keys only.
 */
import type { AutomationEntityType } from "../api/automationsApi";

export type StatusActionManagedKey =
  | "warehouse_commit"
  | "generate_sale_correction"
  | "send_email_customer"
  | "send_email_internal";

/** Checkbox labels in the compact status modal. */
export const STATUS_ACTION_CHECKBOX_LABELS: Record<StatusActionManagedKey, string> = {
  warehouse_commit: "Zatwierdź przyjęcie w magazynie",
  generate_sale_correction: "Wystaw korektę faktury",
  send_email_customer: "Wyślij e-mail klientowi",
  send_email_internal: "Wyślij e-mail wewnętrzny",
};

/** Compact column headers for the status actions matrix. */
export const STATUS_ACTION_COLUMN_HEADERS: Record<StatusActionManagedKey, string> = {
  warehouse_commit: "Magazyn",
  generate_sale_correction: "Korekta",
  send_email_customer: "E-mail klient",
  send_email_internal: "E-mail wewn.",
};

/** Full titles for column header tooltips. */
export const STATUS_ACTION_COLUMN_TOOLTIPS: Record<StatusActionManagedKey, string> = {
  warehouse_commit:
    "Finalizuje przyjęcie zwrotu przez workflow RMZ i tworzy dokument Z-PZ, jeśli zwrot jest gotowy do przyjęcia.",
  generate_sale_correction:
    "Wystawia korektę faktury na podstawie finalnie przyjętych pozycji zwrotu. Zwrot musi być wcześniej przyjęty w magazynie.",
  send_email_customer: "Wyślij e-mail klientowi po wejściu w ten status",
  send_email_internal: "Wyślij e-mail wewnętrzny po wejściu w ten status",
};

export const WAREHOUSE_COMMIT_TOOLTIP = STATUS_ACTION_COLUMN_TOOLTIPS.warehouse_commit;
export const SALE_CORRECTION_TOOLTIP = STATUS_ACTION_COLUMN_TOOLTIPS.generate_sale_correction;

/** Keys that use a simple ON/OFF checkbox (no template/user config). */
export const STATUS_ACTION_SIMPLE_TOGGLE_KEYS: ReadonlySet<StatusActionManagedKey> = new Set([
  "warehouse_commit",
  "generate_sale_correction",
]);

export function managedKeysForEntity(entityType: AutomationEntityType): StatusActionManagedKey[] {
  if (entityType === "RETURN") {
    return [
      "warehouse_commit",
      "generate_sale_correction",
      "send_email_customer",
      "send_email_internal",
    ];
  }
  return ["send_email_customer", "send_email_internal"];
}
