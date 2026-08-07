export const BDO_TAB_META: Record<
  string,
  { title: string; description: string }
> = {
  "/warehouse/bdo/dashboard": {
    title: "Dashboard BDO",
    description: "Podgląd materiałów opakowaniowych objętych raportowaniem środowiskowym.",
  },
  "/warehouse/bdo/materials": {
    title: "Materiały opakowaniowe",
    description: "Flagi BDO i masy jednostkowe (kg) — stany pochodzą z magazynu WMS.",
  },
  "/warehouse/bdo/movements": {
    title: "Historia",
    description: "Ruchy wynikające z dokumentów magazynowych (PZ / RW).",
  },
  "/warehouse/bdo/monthly-report": {
    title: "Raport miesięczny",
    description: "Raport BDO z przyjęć PZ i zużycia RW (w tym pakowanie).",
  },
  "/warehouse/bdo/settings": {
    title: "Ustawienia BDO",
    description: "Dane podmiotu i metodologia raportu.",
  },
};
