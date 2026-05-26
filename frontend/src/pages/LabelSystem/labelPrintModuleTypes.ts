/** Typ szablonu etykiety / wydruku — wybór modułu przed wejściem do edytora. */
export const LABEL_PRINT_MODULE_TYPE_ORDER = ["location", "cart", "basket", "product", "order"] as const;

export type LabelPrintModuleType = (typeof LABEL_PRINT_MODULE_TYPE_ORDER)[number];

export const LABEL_PRINT_MODULE_TYPE_LABELS: Record<LabelPrintModuleType, string> = {
  location: "Lokalizacja",
  cart: "Wózek",
  basket: "Koszyk",
  product: "Produkt",
  order: "Zamówienie",
};
