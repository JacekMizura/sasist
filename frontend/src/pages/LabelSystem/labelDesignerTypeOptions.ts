import type { TemplateType } from "../../types/labelSystem";

/** Typy widoczne wyłącznie w projektancie etykiet magazynowych (bez dokumentów ERP). */
export const LABEL_DESIGNER_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "location", label: "Lokalizacja" },
  { value: "product", label: "Produkt" },
  { value: "pallet", label: "Paleta" },
  { value: "cart", label: "Wózek" },
  { value: "basket", label: "Koszyk" },
  { value: "rack", label: "Regał" },
  { value: "shelf", label: "Półka" },
  { value: "rack_segment", label: "Segment regału" },
  { value: "zone", label: "Strefa" },
  { value: "carton", label: "Karton" },
  { value: "parcel", label: "Paczka" },
  { value: "other", label: "Inne" },
];

const ERP_OR_ORDER_TYPES = new Set([
  "order",
  "document_receipt",
  "document_invoice",
  "document_wz",
  "document_correction",
]);

export function labelDesignerTypeLabel(value: string | null | undefined): string {
  const v = (value ?? "location").trim() || "location";
  const hit = LABEL_DESIGNER_TYPE_OPTIONS.find((o) => o.value === v);
  if (hit) return hit.label;
  if (ERP_OR_ORDER_TYPES.has(v)) return "Lokalizacja";
  return v;
}

/** Paleta zmiennych — mapowanie podtypów magazynowych na istniejące grupy (bez zmiany API). */
export function labelDesignerVariableCategoryType(value: string | null | undefined): TemplateType {
  const v = (value ?? "location").trim() || "location";
  if (v === "product") return "product";
  if (v === "cart") return "cart";
  if (v === "basket") return "basket";
  return "location";
}

export function isLabelDesignerTypeValue(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  if (ERP_OR_ORDER_TYPES.has(v)) return false;
  return LABEL_DESIGNER_TYPE_OPTIONS.some((o) => o.value === v);
}
