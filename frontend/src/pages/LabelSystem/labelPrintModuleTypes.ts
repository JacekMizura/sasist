/** Typ szablonu etykiety / wydruku — wybór modułu przed wejściem do edytora. */
export const LABEL_PRINT_MODULE_TYPE_ORDER = [
  "location",
  "cart",
  "basket",
  "product",
  "order",
] as const;

export const DOCUMENT_PRINT_MODULE_TYPE_ORDER = [
  "document_receipt",
  "document_invoice",
  "document_wz",
  "document_correction",
] as const;

export type LabelPrintModuleType = (typeof LABEL_PRINT_MODULE_TYPE_ORDER)[number];
export type DocumentPrintModuleType = (typeof DOCUMENT_PRINT_MODULE_TYPE_ORDER)[number];
export type AnyPrintModuleType = LabelPrintModuleType | DocumentPrintModuleType;

export const LABEL_PRINT_MODULE_TYPE_LABELS: Record<LabelPrintModuleType, string> = {
  location: "Lokalizacja",
  cart: "Wózek",
  basket: "Koszyk",
  product: "Produkt",
  order: "Zamówienie",
};

export const DOCUMENT_PRINT_MODULE_TYPE_LABELS: Record<DocumentPrintModuleType, string> = {
  document_receipt: "Paragon",
  document_invoice: "Faktura VAT",
  document_wz: "WZ",
  document_correction: "Korekta",
};

export function printModuleTypeLabel(type: string): string {
  if (type in LABEL_PRINT_MODULE_TYPE_LABELS) {
    return LABEL_PRINT_MODULE_TYPE_LABELS[type as LabelPrintModuleType];
  }
  if (type in DOCUMENT_PRINT_MODULE_TYPE_LABELS) {
    return DOCUMENT_PRINT_MODULE_TYPE_LABELS[type as DocumentPrintModuleType];
  }
  return type;
}

export function isDocumentPrintModuleType(type: string): type is DocumentPrintModuleType {
  return (DOCUMENT_PRINT_MODULE_TYPE_ORDER as readonly string[]).includes(type);
}
