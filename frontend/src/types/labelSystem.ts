/**
 * Label System (System Etykiet) – template and print queue types.
 */

import type { NormalizedStorageType } from "./warehouse";

export type BarcodeFormat = "Code128" | "EAN13" | "QR" | "DataMatrix";

export const DYNAMIC_BINDINGS = [
  "location_name",
  "rack_id",
  "level",
  "zone_name",
  "volume_capacity",
  "barcode_data",
  "storage_type",
  "aisle_letter",
  "rack_index",
] as const;
/**
 * V2 bindings: allow arbitrary variables like "{loc_name}".
 * Keep DYNAMIC_BINDINGS for backward compatibility (dropdowns / defaults).
 */
export type DynamicBinding = string;

/** Template type controls which variable groups are relevant and which preview data is used. */
export type TemplateType =
  | "location"
  | "product"
  | "cart"
  | "basket"
  | "order"
  | "document_receipt"
  | "document_invoice"
  | "document_wz"
  | "document_correction";

export const TEMPLATE_TYPE_OPTIONS: { value: TemplateType; label: string }[] = [
  { value: "location", label: "Lokalizacja" },
  { value: "product", label: "Produkt" },
  { value: "cart", label: "Wózek" },
  { value: "basket", label: "Koszyk" },
  { value: "order", label: "Zamówienie" },
  { value: "document_receipt", label: "Paragon" },
  { value: "document_invoice", label: "Faktura VAT" },
  { value: "document_wz", label: "WZ" },
  { value: "document_correction", label: "Korekta" },
];

export type VariableCategoryId =
  | "warehouse"
  | "fleet"
  | "cart"
  | "basket"
  | "product_basic"
  | "product_pricing"
  | "product_logistics"
  | "product_batch"
  | "product_origin"
  | "product_regulations"
  | "product_media"
  | "orders"
  | "documents";
export type LabelVariable = { id: string; label: string; token: string };

export const LABEL_VARIABLE_CATEGORIES: Array<{
  id: VariableCategoryId;
  label: string;
  items: LabelVariable[];
}> = [
  {
    id: "warehouse",
    label: "Magazyn",
    items: [
      { id: "loc_name", label: "Nazwa lokacji", token: "{loc_name}" },
      { id: "loc_barcode", label: "Kod lokacji", token: "{loc_barcode}" },
      { id: "rack_name", label: "Regał", token: "{rack_name}" },
      { id: "floor", label: "Piętro", token: "{floor}" },
      { id: "row", label: "Rząd", token: "{row}" },
      { id: "floor_1", label: "Piętro 1", token: "{floor_1}" },
      { id: "floor_2", label: "Piętro 2", token: "{floor_2}" },
      { id: "floor_3", label: "Piętro 3", token: "{floor_3}" },
      { id: "barcode_1", label: "Kod kreskowy 1", token: "{barcode_1}" },
      { id: "barcode_2", label: "Kod kreskowy 2", token: "{barcode_2}" },
      { id: "barcode_3", label: "Kod kreskowy 3", token: "{barcode_3}" },
      { id: "loc_name_1", label: "Nazwa lokacji 1", token: "{loc_name_1}" },
      { id: "loc_name_2", label: "Nazwa lokacji 2", token: "{loc_name_2}" },
      { id: "loc_name_3", label: "Nazwa lokacji 3", token: "{loc_name_3}" },
      { id: "bin", label: "Skrzynka", token: "{bin}" },
      { id: "zone", label: "Strefa", token: "{zone}" },
    ],
  },
  {
    id: "cart",
    label: "Wózek",
    items: [
      { id: "cart_id", label: "Identyfikator wózka", token: "{cart_id}" },
      { id: "cart_name", label: "Nazwa wózka", token: "{cart_name}" },
      { id: "cart_barcode", label: "Kod wózka", token: "{cart_barcode}" },
      { id: "cart_capacity", label: "Pojemność wózka", token: "{cart_capacity}" },
      { id: "cart_weight", label: "Masa wózka", token: "{cart_weight}" },
      { id: "cart_sections", label: "Liczba sekcji", token: "{cart_sections}" },
    ],
  },
  {
    id: "basket",
    label: "Koszyk",
    items: [
      { id: "basket_id", label: "Identyfikator koszyka", token: "{basket_id}" },
      { id: "basket_code", label: "Kod koszyka", token: "{basket_code}" },
      { id: "basket_barcode", label: "Kod kreskowy koszyka", token: "{basket_barcode}" },
      { id: "basket_level", label: "Poziom koszyka", token: "{basket_level}" },
      { id: "basket_position", label: "Pozycja koszyka", token: "{basket_position}" },
      { id: "basket_cart_id", label: "Wózek (powiązanie)", token: "{cart_id}" },
    ],
  },
  {
    id: "fleet",
    label: "Wózki (legacy)",
    items: [
      { id: "cart_id", label: "Identyfikator wózka", token: "{cart_id}" },
      { id: "cart_barcode", label: "Kod wózka", token: "{cart_barcode}" },
      { id: "load_capacity", label: "Udźwig", token: "{load_capacity}" },
    ],
  },
  {
    id: "product_basic",
    label: "Produkt — podstawowe",
    items: [
      { id: "prod_name", label: "Nazwa produktu", token: "{prod_name}" },
      { id: "sku", label: "SKU", token: "{sku}" },
      { id: "ean", label: "EAN", token: "{ean}" },
      { id: "product_barcode", label: "Kod kreskowy produktu", token: "{product_barcode}" },
    ],
  },
  {
    id: "product_pricing",
    label: "Ceny i VAT",
    items: [
      { id: "sale_price", label: "Cena sprzedaży", token: "{sale_price}" },
      { id: "purchase_price", label: "Cena zakupu", token: "{purchase_price}" },
      { id: "vat_rate", label: "Stawka VAT", token: "{vat_rate}" },
    ],
  },
  {
    id: "product_logistics",
    label: "Wymiary i logistyka",
    items: [
      { id: "unit", label: "Jednostka", token: "{unit}" },
      { id: "weight", label: "Waga", token: "{weight}" },
      { id: "length", label: "Długość", token: "{length}" },
      { id: "width", label: "Szerokość", token: "{width}" },
      { id: "height", label: "Wysokość", token: "{height}" },
    ],
  },
  {
    id: "product_batch",
    label: "Partie i numery",
    items: [
      { id: "batch_number", label: "Numer partii", token: "{batch_number}" },
      { id: "serial_number", label: "Numer seryjny", token: "{serial_number}" },
      { id: "expiration_date", label: "Data ważności", token: "{expiration_date}" },
    ],
  },
  {
    id: "product_origin",
    label: "Producent i pochodzenie",
    items: [
      { id: "manufacturer", label: "Producent", token: "{manufacturer}" },
      { id: "country_of_origin", label: "Kraj pochodzenia", token: "{country_of_origin}" },
    ],
  },
  {
    id: "product_regulations",
    label: "Regulacje",
    items: [
      { id: "has_ce", label: "Oznaczenie CE (tak/nie)", token: "{has_ce}" },
      { id: "regulations", label: "Regulacje / symbole", token: "{regulations}" },
    ],
  },
  {
    id: "product_media",
    label: "Multimedia",
    items: [{ id: "image", label: "Zdjęcie produktu (URL)", token: "{image}" }],
  },
  {
    id: "orders",
    label: "Zamówienia",
    items: [
      { id: "order_id", label: "{order_id}", token: "{order_id}" },
      { id: "client", label: "{client}", token: "{client}" },
      { id: "priority", label: "{priority}", token: "{priority}" },
    ],
  },
  {
    id: "documents",
    label: "Dokumenty",
    items: [
      { id: "document_number", label: "Numer dokumentu", token: "{{document.number}}" },
      { id: "document_date", label: "Data dokumentu", token: "{{document.date}}" },
      { id: "customer_name", label: "Nazwa klienta", token: "{{customer.name}}" },
      { id: "customer_address", label: "Adres klienta", token: "{{customer.address}}" },
      { id: "items", label: "Pozycje", token: "{{items}}" },
      { id: "summary_net", label: "Suma netto", token: "{{summary.net}}" },
      { id: "summary_gross", label: "Suma brutto", token: "{{summary.gross}}" },
      { id: "payment_method", label: "Metoda płatności", token: "{{payment.method}}" },
    ],
  },
];

/** Which variable categories to show for each template type. */
export const TEMPLATE_TYPE_CATEGORIES: Record<TemplateType, VariableCategoryId[]> = {
  location: ["warehouse"],
  product: [
    "product_basic",
    "product_pricing",
    "product_logistics",
    "product_batch",
    "product_origin",
    "product_regulations",
    "product_media",
  ],
  cart: ["cart", "fleet"],
  basket: ["basket", "cart"],
  order: ["orders"],
  document_receipt: ["documents"],
  document_invoice: ["documents"],
  document_wz: ["documents"],
  document_correction: ["documents"],
};

/** Preview data type for template editor. */
export type PreviewDataType = "location" | "cart" | "basket" | "product" | "order";

/** Sample records per preview type for realistic barcode/text preview in the template editor. */
export const PREVIEW_SAMPLES: Record<PreviewDataType, Record<string, unknown>> = {
  location: {
    location_name: "A1-C-6",
    loc_name: "A1-C-6",
    rack_id: "A01",
    rack_name: "A1",
    floor: "C",
    row: "6",
    bin: "B",
    level: 2,
    position: 2,
    zone_name: "Magazyn",
    volume_capacity: 120,
    barcode_data: "A1-02-03",
    loc_barcode: "A1-02-03",
    location_barcode: "A1-02-03",
    storage_type: "primary",
    "{loc_name}": "A1-C-6",
    "{loc_barcode}": "A1-02-03",
    "{rack_name}": "A1",
    "{floor}": "C",
    "{row}": "6",
    "{bin}": "B",
    "{zone}": "Magazyn",
    floor_1: "C",
    floor_2: "G",
    floor_3: "H",
    barcode_1: "A1-01-01",
    barcode_2: "A1-02-01",
    barcode_3: "A1-03-01",
    loc_name_1: "A1-C-1",
    loc_name_2: "A1-G-1",
    loc_name_3: "A1-H-1",
  },
  cart: {
    cart_id: "1",
    cart_name: "CART-A",
    cart_barcode: "CART-0001",
    cart_capacity: "450 dm³",
    cart_weight: "120 kg",
    cart_sections: "6",
    barcode_data: "CART-0001",
    "{cart_id}": "1",
    "{cart_name}": "CART-A",
    "{cart_barcode}": "CART-0001",
    "{cart_capacity}": "450 dm³",
    "{cart_weight}": "120 kg",
    "{cart_sections}": "6",
  },
  basket: {
    basket_id: "42",
    basket_code: "S-1/2",
    basket_barcode: "CART-0001-B02",
    basket_level: "1",
    basket_position: "2",
    cart_id: "1",
    barcode_data: "CART-0001-B02",
    "{basket_id}": "42",
    "{basket_code}": "S-1/2",
    "{basket_barcode}": "CART-0001-B02",
    "{basket_level}": "1",
    "{basket_position}": "2",
    "{cart_id}": "1",
  },
  product: {
    prod_name: "Karton 40x30x25",
    sku: "KAR-40-01",
    ean: "5901234123457",
    barcode_data: "5901234123457",
    product_barcode: "5901234123457",
    sale_price: "24,99 PLN",
    purchase_price: "18,50 PLN",
    vat_rate: "23%",
    manufacturer: "ACME Manufacturing Sp. z o.o.",
    country_of_origin: "Polska",
    unit: "szt.",
    weight: "1,2 kg",
    length: "400",
    width: "300",
    height: "250",
    batch_number: "LOT/2026/0142",
    serial_number: "",
    expiration_date: "2027-12-31",
    has_ce: "tak",
    regulations: "CE; REACH",
    image:
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect fill="#e2e8f0" width="120" height="80" rx="6"/><text x="60" y="44" text-anchor="middle" fill="#64748b" font-size="11" font-family="system-ui">Podgląd</text></svg>',
      ),
    "{prod_name}": "Karton 40x30x25",
    "{sku}": "KAR-40-01",
    "{ean}": "5901234123457",
    "{product_barcode}": "5901234123457",
    "{sale_price}": "24,99 PLN",
    "{purchase_price}": "18,50 PLN",
    "{vat_rate}": "23%",
    "{manufacturer}": "ACME Manufacturing Sp. z o.o.",
    "{country_of_origin}": "Polska",
    "{unit}": "szt.",
    "{weight}": "1,2 kg",
    "{length}": "400",
    "{width}": "300",
    "{height}": "250",
    "{batch_number}": "LOT/2026/0142",
    "{serial_number}": "",
    "{expiration_date}": "2027-12-31",
    "{has_ce}": "tak",
    "{regulations}": "CE; REACH",
    "{image}":
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect fill="#e2e8f0" width="120" height="80" rx="6"/><text x="60" y="44" text-anchor="middle" fill="#64748b" font-size="11" font-family="system-ui">Zdjęcie</text></svg>',
      ),
  },
  order: {
    order_id: "ORD-2026-0001",
    client: "ACME Sp. z o.o.",
    priority: "Normalny",
    barcode_data: "ORD-12345",
    order_barcode: "ORD-12345",
    "{order_id}": "ORD-2026-0001",
    "{client}": "ACME Sp. z o.o.",
    "{priority}": "Normalny",
    "{order_barcode}": "ORD-12345",
  },
};

export type LabelElementKind =
  | "barcode"
  | "dynamicText"
  | "staticText"
  | "image"
  | "line"
  | "rect"
  | "section"
  | "statusIcon"
  | "triangle"
  | "arrow"
  | "polygon"
  | "group"
  | "repeater";

export type StatusIconType = "lock" | "heavy_load" | "hazard" | "arrow_up" | "arrow_down" | "arrow_left" | "arrow_right" | "none";

/** Rotation in degrees. Any value 0–360; stored as number. */
export type RotationDegrees = number;

export interface LabelElementBase {
  id: string;
  type: LabelElementKind;
  x: number; // mm
  y: number;
  width: number;
  height: number;
  /** Rotation in degrees (0–360). Applied around element center. */
  rotation?: number;
  /** Stack order (higher = on top). */
  zIndex?: number;
  /** When false, element is hidden in preview/print and ignored for canvas hit-testing in the designer. */
  visible?: boolean;
  /** Background fill color (hex). Applied to text/shape background. */
  backgroundColor?: string;
  /** Text/foreground color (hex). Applied to text and shape stroke. */
  textColor?: string;
  /** Border/stroke color for shapes (hex). */
  borderColor?: string;
}

/** Barcode value text position. */
export type BarcodeTextPosition = "below" | "above" | "hidden";

export interface BarcodeElement extends LabelElementBase {
  type: "barcode";
  format: BarcodeFormat;
  /** Binding for data (e.g. barcode_data or location_name) */
  dataBinding: DynamicBinding;
  showValue?: boolean;
  /** Where to show the barcode value text: below, above, or hidden */
  textPosition?: BarcodeTextPosition;
  /** QR: sposób budowania danych */
  qrDataMode?: "dynamic" | "static" | "template" | "url";
  /** QR: zawartość statyczna / URL / szablon z tokenami {pole} */
  qrContent?: string;
  /** QR: margines kodu (moduły) */
  qrMargin?: number;
  /** QR: poziom korekcji błędów */
  qrErrorCorrection?: "L" | "M" | "Q" | "H";
  /** QR: kolor modułów */
  qrDarkColor?: string;
  /** QR: kolor tła */
  qrLightColor?: string;
  /** QR: przezroczyste tło */
  qrTransparentBg?: boolean;
  /** QR: dopasowanie i jakość */
  qrAutoScale?: boolean;
  qrKeepAspect?: boolean;
  qrHighQuality?: boolean;
  /** QR: szybki preset danych */
  qrPreset?: "none" | "product_link" | "manual_link" | "product_data";
}

/** Vertical alignment inside the element box. */
export type VerticalAlign = "top" | "middle" | "bottom";

export interface DynamicTextElement extends LabelElementBase {
  type: "dynamicText";
  binding: DynamicBinding;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
  verticalAlign?: VerticalAlign;
  /** When true, render text vertically (e.g. stacked letters for location codes like "RZ") */
  verticalText?: boolean;
}

export interface StaticTextElement extends LabelElementBase {
  type: "staticText";
  text: string;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
  verticalAlign?: VerticalAlign;
  /** When true, render text vertically (stacked) */
  verticalText?: boolean;
}

export interface ImageElement extends LabelElementBase {
  type: "image";
  src: string; // data URL or URL
  alt?: string;
  /** Opcjonalnie: klucz pola w rekordzie (np. `image`) — nadpisuje `src`, gdy w danych jest wartość. */
  srcBinding?: string;
}

export interface LineElement extends LabelElementBase {
  type: "line";
  strokeWidth?: number;
}

/** Optional conditional styling: first matching condition overrides fill/stroke. */
export type ConditionalStyleRule = {
  if: string;
  fill?: string;
  stroke?: string;
};

export interface RectElement extends LabelElementBase {
  type: "rect";
  strokeWidth?: number;
  /** Primary rectangle fill (SVG/PDF). Use this; `backgroundColor` on base is legacy fallback only. */
  fill?: string;
  /** Optional: first matching rule overrides fill and optionally stroke (evaluated in layout phase). */
  conditions?: ConditionalStyleRule[];
  /** Corner radius in mm (0 = square). Clamped to min(width,height)/2 in layout/render. */
  cornerRadius?: number;
}

/** Section block: colored zone (e.g. rack segment, warning area). */
export interface SectionElement extends LabelElementBase {
  type: "section";
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
}

export interface StatusIconElement extends LabelElementBase {
  type: "statusIcon";
  icon: StatusIconType;
  /** When to show: e.g. reserve -> lock, bottom level -> heavy_load */
  condition?: "reserve" | "bottom_level" | "always";
}

/** Triangle shape: clip-path polygon. */
export interface TriangleElement extends LabelElementBase {
  type: "triangle";
  /** Which corner is right angle: "topLeft" | "topRight" | "bottomLeft" | "bottomRight" */
  variant?: "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
}

/** Arrow shape (e.g. for flow). */
export interface ArrowElement extends LabelElementBase {
  type: "arrow";
  /** "up" | "down" | "left" | "right" */
  direction?: "up" | "down" | "left" | "right";
}

/** Polygon: custom clip-path points (percent). */
export interface PolygonElement extends LabelElementBase {
  type: "polygon";
  /** e.g. "0 0, 100% 0, 50% 100%" for triangle */
  points?: string;
}

/** Group: children positions are relative to group (x, y). */
export interface GroupElement {
  id: string;
  type: "group";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  visible?: boolean;
  elements: LabelElement[];
}

/**
 * Repeater: repeat template along horizontal, vertical, or grid (e.g. rack levels).
 * Each iteration merges `dataset_index` (source row, before filter/sort) and `repeater_slot`
 * (0-based after filter/sort) into the child record for bindings / visibleIf.
 */
export interface RepeaterElement {
  id: string;
  type: "repeater";
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  visible?: boolean;
  /** Binding for array data, e.g. "levels" */
  dataset: string;
  direction: "horizontal" | "vertical";
  itemWidth: number;
  itemHeight?: number;
  /** One root group is recommended; flat lists are still accepted at runtime. */
  template: { elements: (LabelElement | GroupElement)[] };
  /** Optional: sort dataset by this field (numeric or string) before rendering */
  sortBy?: string;
  /** Optional: "horizontal" | "vertical" | "grid". When "grid", use columns. Fallback: direction. */
  layout?: "horizontal" | "vertical" | "grid";
  /** Number of columns when layout === "grid" */
  columns?: number;
  /** Optional: filter items with same syntax as visibleIf (e.g. "{zone} == 'A'", "{dataset_index} == 0"). */
  filter?: string;
}

export type LabelElement =
  | BarcodeElement
  | DynamicTextElement
  | StaticTextElement
  | ImageElement
  | LineElement
  | RectElement
  | SectionElement
  | StatusIconElement
  | TriangleElement
  | ArrowElement
  | PolygonElement;

/** Top-level template item: normal element, group, or repeater. */
export type TemplateElement = LabelElement | GroupElement | RepeaterElement;

export interface LabelTemplate {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  elements: TemplateElement[];
  /** Template type: which entity this label is for (controls variable availability and preview). */
  template_type?: TemplateType;
  /** Optional: change colors by metadata (e.g. Reserve -> red background) */
  conditionalFormatting?: ConditionalFormatRule[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ConditionalFormatRule {
  /** When this condition matches the record */
  when: "reserve" | "bottom_level" | "primary" | "always";
  backgroundColor?: string;
  textColor?: string;
}

export type SelectionMode = "all" | "by_rack" | "by_zone" | "reserve_only" | "manual";

export interface FormattingRules {
  zeroPadLevel?: boolean;
  zeroPadSegment?: boolean;
  zeroPadRackIndex?: boolean;
  prefix?: string;
  suffix?: string;
}

export interface LabelRecord {
  location_name?: string;
  /** Parsed from hyphenated loc_name when ≥3 segments, e.g. A1-C-6 → C */
  floor?: string;
  /** Parsed from hyphenated loc_name when ≥3 segments, e.g. A1-C-6 → 6 */
  row?: string;
  /** Parsed rack segment(s) from loc_name, or structural rack id */
  rack_name?: string;
  /** Canonical location code without leading zeros, e.g. A1-1-3 */
  location_code?: string;
  location_barcode?: string;
  rack?: string;
  position?: number;
  rack_id?: string;
  level?: number;
  zone_name?: string;
  volume_capacity?: number;
  barcode_data: string;
  storage_type?: NormalizedStorageType;
  aisle_letter?: string;
  rack_index?: number;
  isBottomLevel?: boolean;
  /** Cart / basket / product / order fields for template_type cart | basket | product | order */
  cart_id?: string;
  cart_name?: string;
  cart_barcode?: string;
  cart_capacity?: string;
  cart_weight?: string;
  cart_sections?: string;
  basket_id?: string;
  basket_code?: string;
  basket_barcode?: string;
  basket_level?: string;
  basket_position?: string;
  prod_name?: string;
  sku?: string;
  ean?: string;
  order_id?: string;
  client?: string;
  priority?: string;
  /** V2: allow extended variables like "{loc_name}" */
  [key: string]: unknown;
}
