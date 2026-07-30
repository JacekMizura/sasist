export const DETAIL_TABS = [
  { id: "summary", label: "Podsumowanie" },
  { id: "products", label: "Produkty i magazyn" },
  { id: "comms", label: "Komunikacja" },
  { id: "docs", label: "Dokumenty i pliki" },
  { id: "logs", label: "Logi" },
] as const;

export type DetailTabId = (typeof DETAIL_TABS)[number]["id"];
