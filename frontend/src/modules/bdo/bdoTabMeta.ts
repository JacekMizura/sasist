export type BdoTabMeta = {
  title: string;
  description: string;
  breadcrumbLabel: string;
};

const META: Record<string, BdoTabMeta> = {
  "/warehouse/bdo/dashboard": {
    title: "Dashboard",
    description: "Ewidencja materiałów opakowaniowych i raportowanie BDO",
    breadcrumbLabel: "Dashboard",
  },
  "/warehouse/bdo/materials": {
    title: "Materiały opakowaniowe",
    description: "Katalog materiałów magazynowych z polami BDO — kg tworzywa, papieru i innych surowców na jednostkę",
    breadcrumbLabel: "Materiały opakowaniowe",
  },
  "/warehouse/bdo/movements": {
    title: "Historia ruchów",
    description: "Historia zakupów, korekt i spisów materiałów",
    breadcrumbLabel: "Historia ruchów",
  },
  "/warehouse/bdo/purchases": {
    title: "Rejestracja zakupu (BDO)",
    description: "Ręczne wpisy zakupów materiałów objętych ewidencją BDO",
    breadcrumbLabel: "Zakupy BDO",
  },
  "/warehouse/bdo/stock-count": {
    title: "Spis z natury",
    description: "Inwentaryzacja materiałów objętych ewidencją BDO",
    breadcrumbLabel: "Spis z natury",
  },
  "/warehouse/bdo/monthly-report": {
    title: "Raport miesięczny",
    description: "Zużycie opakowań wg surowca — dane do raportowania BDO za wybrany okres",
    breadcrumbLabel: "Raport miesięczny",
  },
  "/warehouse/bdo/corrections": {
    title: "Korekty",
    description: "Korekty stanu materiałów BDO — uszkodzenia, utylizacja, zwroty i stan otwarcia",
    breadcrumbLabel: "Korekty",
  },
  "/warehouse/bdo/settings": {
    title: "Ustawienia",
    description: "Dane firmy raportującej, numery rejestrowe i domyślna metodyka obliczeń",
    breadcrumbLabel: "Ustawienia",
  },
};

export function resolveBdoTabMeta(pathname: string): BdoTabMeta | null {
  if (META[pathname]) return META[pathname];
  const base = pathname.replace(/\/$/, "");
  return META[base] ?? null;
}
