import type { OrderCaseLineCondition, OrderCaseSettlement } from "./orderCaseCreateTypes";

export const ORDER_CASE_RETURN_REASONS: { id: string; label: string }[] = [
  { id: "changed_mind", label: "Zmiana decyzji" },
  { id: "wrong_size", label: "Zły rozmiar / wariant" },
  { id: "damaged", label: "Uszkodzony w transporcie" },
  { id: "defective", label: "Wada produktu" },
  { id: "wrong_item", label: "Zły produkt" },
  { id: "other", label: "Inny powód" },
];

export const ORDER_CASE_COMPLAINT_REASONS: { id: string; label: string }[] = [
  { id: "transport", label: "Uszkodzenie w transporcie" },
  { id: "factory", label: "Wada fabryczna" },
  { id: "missing", label: "Brakująca część" },
  { id: "use", label: "Ślady użytkowania" },
  { id: "wrong", label: "Zły produkt" },
];

export const ORDER_CASE_CONDITIONS: { id: OrderCaseLineCondition; label: string }[] = [
  { id: "new", label: "Nowy / nieotwarty" },
  { id: "opened", label: "Otwarty" },
  { id: "damaged", label: "Uszkodzony" },
  { id: "incomplete", label: "Niekompletny" },
];

export const ORDER_CASE_SETTLEMENTS: { id: OrderCaseSettlement; label: string }[] = [
  { id: "refund", label: "Zwrot środków" },
  { id: "exchange", label: "Wymiana" },
  { id: "store_credit", label: "Saldo klienta" },
  { id: "repair", label: "Naprawa" },
];

export function orderCaseReasonLabel(kind: "return" | "complaint", id: string): string {
  const list = kind === "return" ? ORDER_CASE_RETURN_REASONS : ORDER_CASE_COMPLAINT_REASONS;
  return list.find((r) => r.id === id)?.label ?? id;
}

export function orderCaseConditionLabel(id: OrderCaseLineCondition): string {
  return ORDER_CASE_CONDITIONS.find((c) => c.id === id)?.label ?? id;
}
