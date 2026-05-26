const CARRIER_OP_LABELS: Record<string, string> = {
  CREATED: "Utworzenie nośnika",
  PATCHED: "Edycja nośnika",
  DELETED_SOFT: "Usunięcie nośnika",
  MOVED: "Przesunięcie",
  MOVED_EMPTY: "Przesunięcie (pusty)",
  EMPTIED: "Opróżnienie",
  ITEMS_ADDED: "Dodanie towaru",
  ITEMS_REMOVED: "Usunięcie towaru",
  BULK_CREATED: "Masowe utworzenie",
  RECEIVING_ON_CARRIER: "Przyjęcie na nośnik",
  PUTAWAY_MOVE: "Rozlokowanie",
};

export function carrierOperationLabel(operationType: string, apiLabel?: string | null): string {
  const fromApi = (apiLabel || "").trim();
  if (fromApi) return fromApi;
  const key = (operationType || "").trim().toUpperCase();
  if (!key) return "Operacja";
  return CARRIER_OP_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
