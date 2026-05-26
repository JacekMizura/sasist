export type BulkActionKind =
  | "change_status"
  | "set_priority"
  | "issue_document"
  | "generate_label"
  | "send_message"
  | "add_note"
  | "change_shipping";

export type BulkActionConfig = {
  change_status?: { statusId: string };
  set_priority?: { priorityColor: "gray" | "blue" | "green" | "yellow" | "orange" | "red" | null };
  issue_document?: { documentType: "PARAGON" | "INVOICE" };
  change_shipping?: { shippingMethodId: string };
  send_message?: { subject: string; body: string };
  add_note?: { text: string };
  generate_label?: { templateCode: string };
};

export type BulkActionRow = {
  id: string;
  kind: BulkActionKind;
  expanded: boolean;
};

export const BULK_ACTION_LABELS: Record<BulkActionKind, string> = {
  change_status: "Zmień status",
  set_priority: "Ustaw priorytet",
  issue_document: "Wystaw dokument",
  generate_label: "Generuj etykietę",
  send_message: "Wyślij wiadomość",
  add_note: "Dodaj notatkę",
  change_shipping: "Zmień metodę dostawy",
};

export const BULK_ACTION_DROPDOWN_ORDER: BulkActionKind[] = [
  "change_status",
  "set_priority",
  "issue_document",
  "generate_label",
  "send_message",
  "add_note",
  "change_shipping",
];
