import {
  LABEL_VARIABLE_CATEGORIES,
  PREVIEW_SAMPLES,
  TEMPLATE_TYPE_CATEGORIES,
} from "../../types/labelSystem";
import type { ProductLabelData } from "../../types/productLabel";

/** Polish / readable placeholders shown on template preview (not sample product data). */
const PLACEHOLDER_BY_FIELD: Record<string, string> = {
  prod_name: "{{NAZWA}}",
  sku: "{{SKU}}",
  ean: "{{EAN}}",
  product_barcode: "{{KOD}}",
  barcode_data: "{{KOD}}",
  sale_price: "{{CENA}}",
  purchase_price: "{{CENA_ZAKUPU}}",
  vat_rate: "{{VAT}}",
  unit: "{{JEDNOSTKA}}",
  weight: "{{WAGA}}",
  length: "{{DLUGOSC}}",
  width: "{{SZEROKOSC}}",
  height: "{{WYSOKOSC}}",
  batch_number: "{{PARTIA}}",
  serial_number: "{{SERIA}}",
  expiration_date: "{{DATA_WAZNOSCI}}",
  manufacturer: "{{PRODUCENT}}",
  country_of_origin: "{{KRAJ}}",
  has_ce: "{{CE}}",
  regulations: "{{REGULACJE}}",
  image: "{{ZDJĘCIE}}",
  importer_name: "{{IMPORTER}}",
  importer_address: "{{ADRES_IMPORTERA}}",
  material_composition: "{{SKLAD}}",
  care_instructions: "{{PIELEGACJA}}",
  size_or_length: "{{ROZMIAR}}",
};

/** Tiny SVG so image slots still occupy layout when showing a photo placeholder. */
const IMAGE_PLACEHOLDER_DATA_URI =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">' +
      '<rect fill="#ffffff" stroke="#d1d5db" width="120" height="80" rx="4"/>' +
      '<text x="60" y="44" text-anchor="middle" fill="#9ca3af" font-size="11" font-family="system-ui">{{ZDJĘCIE}}</text>' +
      "</svg>",
  );

function setDual(record: Record<string, unknown>, key: string, value: string) {
  record[key] = value;
  record[`{${key}}`] = value;
}

function productFieldIds(): string[] {
  const cats = new Set(TEMPLATE_TYPE_CATEGORIES.product);
  const ids: string[] = [];
  for (const cat of LABEL_VARIABLE_CATEGORIES) {
    if (!cats.has(cat.id)) continue;
    for (const item of cat.items) ids.push(item.id);
  }
  return ids;
}

/**
 * Data model for „Podgląd szablonu”: same keys as product labels, values = field placeholders.
 */
export function buildProductLabelPlaceholderRecord(): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const id of productFieldIds()) {
    const ph = PLACEHOLDER_BY_FIELD[id] ?? `{{${id.toUpperCase()}}}`;
    setDual(record, id, id === "image" ? IMAGE_PLACEHOLDER_DATA_URI : ph);
  }
  // barcode_data is used by many templates but not always listed as a category item
  setDual(record, "barcode_data", PLACEHOLDER_BY_FIELD.barcode_data);
  // Keep any extra sample keys as placeholders so obscure bindings still resolve
  for (const key of Object.keys(PREVIEW_SAMPLES.product)) {
    if (key.startsWith("{")) continue;
    if (record[key] != null) continue;
    const ph = PLACEHOLDER_BY_FIELD[key] ?? `{{${key.toUpperCase()}}}`;
    setDual(record, key, key === "image" ? IMAGE_PLACEHOLDER_DATA_URI : ph);
  }
  return record;
}

export type ProductLabelDataRecordInput = {
  name: string;
  symbol: string;
  ean: string;
  imageUrl?: string | null;
  manufacturerName: string;
  manufacturerAddress?: string;
  salePrice: number | null;
  purchasePrice?: number | null;
  vatRate?: string;
  unit?: string;
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  labelData: ProductLabelData;
};

function moneyPl(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return `${n.toFixed(2).replace(".", ",")} PLN`;
}

function numStr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(n);
}

/**
 * Data model for „Podgląd gotowej etykiety”: real product / karta fields.
 * Shape matches backend `_product_to_label_record` + catalog product variables.
 */
export function buildProductLabelDataRecord(input: ProductLabelDataRecordInput): Record<string, unknown> {
  const ld = input.labelData;
  const name =
    (ld.product_name_pl ?? "").trim() || input.name.trim() || "—";
  const sku = input.symbol.trim() || input.ean.trim() || "—";
  const ean = input.ean.trim() || "—";
  const barcode = ean !== "—" ? ean : sku;
  const manufacturer =
    input.manufacturerName.trim() || "—";
  const country = (ld.country_of_origin ?? "").trim();
  const sale =
    ld.show_price_on_label === false ? "" : moneyPl(input.salePrice);
  const image = (input.imageUrl ?? "").trim();

  const record: Record<string, unknown> = {};
  setDual(record, "prod_name", name);
  setDual(record, "sku", sku);
  setDual(record, "ean", ean);
  setDual(record, "product_barcode", barcode);
  setDual(record, "barcode_data", barcode);
  setDual(record, "sale_price", sale);
  setDual(record, "purchase_price", moneyPl(input.purchasePrice ?? null));
  setDual(record, "vat_rate", (input.vatRate ?? "").trim());
  setDual(record, "unit", (input.unit ?? "").trim());
  setDual(record, "weight", numStr(input.weight ?? null));
  setDual(record, "length", numStr(input.length ?? null));
  setDual(record, "width", numStr(input.width ?? null));
  setDual(record, "height", numStr(input.height ?? null));
  setDual(record, "batch_number", (ld.batch_number ?? "").trim());
  setDual(record, "serial_number", (ld.series_number ?? "").trim());
  setDual(record, "expiration_date", "");
  setDual(record, "manufacturer", manufacturer);
  setDual(record, "country_of_origin", country);
  setDual(record, "has_ce", ld.requires_ce_mark ? "tak" : "nie");
  setDual(record, "regulations", ld.requires_ce_mark ? "CE" : "");
  setDual(record, "image", image);
  setDual(record, "importer_name", (ld.importer_name ?? "").trim());
  setDual(record, "importer_address", (ld.importer_address ?? "").trim());
  setDual(record, "material_composition", (ld.material_composition ?? "").trim());
  setDual(record, "care_instructions", (ld.care_instructions ?? "").trim());
  setDual(record, "size_or_length", (ld.size_or_length ?? "").trim());
  if (input.manufacturerAddress?.trim()) {
    setDual(record, "manufacturer_address", input.manufacturerAddress.trim());
  }
  return record;
}
