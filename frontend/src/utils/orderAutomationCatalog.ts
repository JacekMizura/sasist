import type { AutomationEffectKind } from "../types/orderAutomation";

export type ConditionFieldDef = {
  key: string;
  label: string;
  category: string;
  valueKind: "status" | "text" | "number";
};

/** Metadane pól warunków — bez listy statusów (statusy z API panelu). */
export const ORDER_AUTOMATION_CONDITION_FIELDS: ConditionFieldDef[] = [
  { key: "order_status", label: "Status zamówienia", category: "Zamówienie", valueKind: "status" },
  { key: "order_source", label: "Źródło zamówienia", category: "Zamówienie", valueKind: "text" },
  { key: "order_number", label: "Numer zamówienia", category: "Zamówienie", valueKind: "text" },
  { key: "customer_email", label: "E-mail klienta", category: "Klient", valueKind: "text" },
  { key: "customer_group", label: "Grupa klienta", category: "Klient", valueKind: "text" },
  { key: "shipment_courier", label: "Przewoźnik / metoda", category: "Wysyłka", valueKind: "text" },
  { key: "shipment_status", label: "Status przesyłki", category: "Wysyłka", valueKind: "text" },
  { key: "payment_status", label: "Status płatności", category: "Płatności", valueKind: "text" },
  { key: "order_total", label: "Wartość zamówienia", category: "Płatności", valueKind: "number" },
  { key: "product_sku", label: "SKU w zamówieniu", category: "Produkty", valueKind: "text" },
  { key: "document_type", label: "Typ dokumentu", category: "Dokumenty", valueKind: "text" },
  { key: "wms_stock_state", label: "Stan magazynowy WMS", category: "WMS", valueKind: "text" },
  { key: "allegro_account", label: "Konto Allegro", category: "Allegro", valueKind: "text" },
  { key: "integration_channel", label: "Kanał integracji", category: "Integracje", valueKind: "text" },
  { key: "custom_field", label: "Pole dodatkowe", category: "Pola własne", valueKind: "text" },
];

export const ORDER_AUTOMATION_OPERATOR_LABELS: Record<string, string> = {
  eq: "=",
  neq: "≠",
  contains: "zawiera",
};

/** Etykiety operatorów w UI reguły (wartości zapisu bez zmian). */
export const ORDER_AUTOMATION_OPERATOR_UI: Record<string, string> = {
  eq: "jest równe",
  neq: "nie jest równe",
  contains: "zawiera",
};

export type EffectKindMeta = { kind: AutomationEffectKind; label: string; category: string };

export const ORDER_AUTOMATION_EFFECT_KINDS: EffectKindMeta[] = [
  { kind: "change_status", label: "Zmień status", category: "Zamówienie" },
  { kind: "send_message", label: "Wyślij wiadomość", category: "Komunikacja" },
  { kind: "generate_document", label: "Generuj dokument", category: "Dokumenty" },
  { kind: "assign_courier", label: "Przypisz kuriera", category: "Wysyłka" },
  { kind: "add_tag", label: "Dodaj tag", category: "Zamówienie" },
  { kind: "print", label: "Drukuj", category: "WMS" },
  { kind: "wms_action", label: "Akcja WMS", category: "WMS" },
];

export function conditionFieldLabel(key: string): string {
  return ORDER_AUTOMATION_CONDITION_FIELDS.find((f) => f.key === key)?.label ?? key;
}

export function effectKindLabel(kind: AutomationEffectKind): string {
  return ORDER_AUTOMATION_EFFECT_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}
