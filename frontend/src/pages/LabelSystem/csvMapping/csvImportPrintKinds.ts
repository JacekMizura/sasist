import {
  DOCUMENT_PRINT_MODULE_TYPE_ORDER,
  printModuleTypeLabel,
} from "../labelPrintModuleTypes";

/** Friendly “typ wydruku” inside Import CSV — drives template list filter. */
export type CsvImportPrintKind =
  | "locations"
  | "product"
  | "cart"
  | "basket"
  | "order"
  | "documents";

export const CSV_IMPORT_PRINT_KINDS: Array<{
  id: CsvImportPrintKind;
  label: string;
  emoji: string;
}> = [
  { id: "locations", label: "Lokalizacje", emoji: "📍" },
  { id: "product", label: "Produkt", emoji: "📦" },
  { id: "cart", label: "Wózek", emoji: "🛒" },
  { id: "basket", label: "Koszyk", emoji: "🧺" },
  { id: "order", label: "Zamówienie", emoji: "🧾" },
  { id: "documents", label: "Dokumenty", emoji: "📄" },
];

const LOCATION_SUBTYPES = new Set([
  "location",
  "pallet",
  "rack",
  "shelf",
  "rack_segment",
  "zone",
  "carton",
  "parcel",
  "other",
]);

const DOCUMENT_TYPES = new Set<string>(DOCUMENT_PRINT_MODULE_TYPE_ORDER);

/** Internal template_type values allowed for a CSV print kind. */
export function csvTemplateTypesForPrintKind(kind: CsvImportPrintKind): ReadonlySet<string> | "location_family" {
  if (kind === "locations") return "location_family";
  if (kind === "documents") return DOCUMENT_TYPES;
  if (kind === "product") return new Set(["product"]);
  if (kind === "cart") return new Set(["cart"]);
  if (kind === "basket") return new Set(["basket"]);
  return new Set(["order"]);
}

export function templateMatchesCsvPrintKind(
  templateType: string | null | undefined,
  kind: CsvImportPrintKind,
): boolean {
  const t = (templateType ?? "location").trim().toLowerCase() || "location";
  const allowed = csvTemplateTypesForPrintKind(kind);
  if (allowed === "location_family") return LOCATION_SUBTYPES.has(t) || t === "location";
  return allowed.has(t);
}

/** User-facing type label — never raw ids like document_invoice. */
export function csvFriendlyTypeLabel(templateType: string | null | undefined): string {
  const t = (templateType ?? "").trim().toLowerCase();
  if (!t || LOCATION_SUBTYPES.has(t)) return "Lokalizacja";
  if (t === "document_wz") return "Wydanie WZ";
  if (t === "document_invoice") return "Faktura VAT";
  if (t === "document_receipt") return "Paragon";
  if (t === "document_correction") return "Korekta";
  const labeled = printModuleTypeLabel(t);
  return labeled === t ? "Szablon" : labeled;
}
