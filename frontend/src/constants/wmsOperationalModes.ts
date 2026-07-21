/** Keys must match backend ``wms_operational_modes.WMS_OPERATIONAL_MODES``. */
export const WMS_OPERATIONAL_MODE_LABELS_PL: Record<string, string> = {
  receiving: "Przyjęcie",
  putaway: "Rozlokowanie PZ",
  picking: "Zbieranie",
  packing: "Pakowanie",
  issues: "Braki",
  inventory: "Inwentaryzacja",
  product_preview: "Podgląd produktu",
  returns: "Zwroty / Reklamacje",
  complaints: "Reklamacje",
  direct_sales: "Sprzedaż stacjonarna",
  production: "Produkcja",
  consolidations: "Kompletacja międzymagazynowa",
  mm: "Przesunięcia magazynowe",
  operations: "Operacje",
  carts: "Wózki",
  qc: "Kontrola jakości",
  documents: "Dokumenty",
  analytics: "Analiza",
  purchasing: "Zakupy",
  labels: "System etykiet",
};

export const WMS_OPERATIONAL_MODE_KEYS = Object.keys(WMS_OPERATIONAL_MODE_LABELS_PL);
