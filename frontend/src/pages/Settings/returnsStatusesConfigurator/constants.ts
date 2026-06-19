import type { ReturnUiMainGroup } from "../../../types/wmsReturn";

export const RETURN_MAIN_GROUP_ORDER: ReturnUiMainGroup[] = ["NEW", "IN_PROGRESS", "DONE"];

export const RETURN_MAIN_GROUP_LABELS: Record<ReturnUiMainGroup, string> = {
  NEW: "Nowe zwroty",
  IN_PROGRESS: "W toku",
  DONE: "Zakończone",
};

/** Krótkie tytuły kart etykiet listy. */
export const LIST_LABEL_CARD_TITLE: Record<ReturnUiMainGroup, string> = {
  NEW: "Nowe",
  IN_PROGRESS: "W toku",
  DONE: "Zakończone",
};

export const RETURN_MAIN_GROUP_DOT: Record<ReturnUiMainGroup, string> = {
  NEW: "bg-blue-500",
  IN_PROGRESS: "bg-orange-500",
  DONE: "bg-emerald-500",
};

export const RETURN_MAIN_GROUP_CHIP: Record<ReturnUiMainGroup, string> = {
  NEW: "border-blue-100 bg-blue-50 text-blue-800",
  IN_PROGRESS: "border-orange-100 bg-orange-50 text-orange-800",
  DONE: "border-emerald-100 bg-emerald-50 text-emerald-800",
};

/** Kolory wierszy decyzji produktowych (wizualna hierarchia). */
export const PRODUCT_DECISION_DOT = ["bg-emerald-500", "bg-blue-500", "bg-violet-500", "bg-orange-500", "bg-red-500"] as const;
