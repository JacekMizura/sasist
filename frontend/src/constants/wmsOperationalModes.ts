/** Keys must match backend ``wms_operational_modes.WMS_OPERATIONAL_MODES``. */
export const WMS_OPERATIONAL_MODE_LABELS_PL: Record<string, string> = {
  packing: "Pakowanie",
  picking: "Zbieranie",
  returns: "Zwroty",
  complaints: "Reklamacje",
  receiving: "Przyjęcia",
  inventory: "Inwentaryzacja",
  carts: "Wózki",
  qc: "Kontrola jakości",
  documents: "Dokumenty",
  analytics: "Analiza",
  purchasing: "Zakupy",
  labels: "System etykiet",
  production: "Produkcja",
};

export const WMS_OPERATIONAL_MODE_KEYS = Object.keys(WMS_OPERATIONAL_MODE_LABELS_PL);
