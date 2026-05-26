/** Identyfikatory sekcji — muszą być zgodne z backend `DETAIL_SECTION_IDS`. */

export const RETURN_DETAIL_SECTION_IDS = [
  "return_status",
  "progress_bar",
  "returned_products",
  "wms_view",
  "customer_data",
  "notes",
  "decision_history",
  "correspondence",
  "attachments",
  "payment_data",
  "refund",
  "damage_photos",
  "customer_stats",
  "prior_returns_history",
] as const;

export type ReturnDetailSectionId = (typeof RETURN_DETAIL_SECTION_IDS)[number];

/** Etykiety wyłącznie po polsku (UI). */
export const RETURN_DETAIL_SECTION_LABELS_PL: Record<ReturnDetailSectionId, string> = {
  return_status: "Status",
  progress_bar: "Postęp rozliczenia",
  returned_products: "Produkty",
  wms_view: "Terminal WMS",
  customer_data: "Dane klienta",
  notes: "Notatki",
  decision_history: "Dziennik",
  correspondence: "Komunikacja",
  attachments: "Dokumenty",
  payment_data: "Przelew",
  refund: "Podsumowanie",
  damage_photos: "Zdjęcia",
  customer_stats: "Statystyki klienta",
  prior_returns_history: "Historia wcześniejszych zwrotów",
};
