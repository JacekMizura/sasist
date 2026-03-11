/**
 * Label System (System Etykiet) – template and print queue types.
 */

export type BarcodeFormat = "Code128" | "QR" | "DataMatrix";

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
export type TemplateType = "location" | "product" | "cart" | "basket" | "order";

export const TEMPLATE_TYPE_OPTIONS: { value: TemplateType; label: string }[] = [
  { value: "location", label: "Location" },
  { value: "product", label: "Product" },
  { value: "cart", label: "Cart" },
  { value: "basket", label: "Basket" },
  { value: "order", label: "Order" },
];

export type VariableCategoryId = "warehouse" | "fleet" | "cart" | "basket" | "products" | "orders";
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
      { id: "loc_name", label: "{loc_name}", token: "{loc_name}" },
      { id: "loc_barcode", label: "{loc_barcode}", token: "{loc_barcode}" },
      { id: "zone", label: "{zone}", token: "{zone}" },
    ],
  },
  {
    id: "cart",
    label: "Cart",
    items: [
      { id: "cart_id", label: "{cart_id}", token: "{cart_id}" },
      { id: "cart_name", label: "{cart_name}", token: "{cart_name}" },
      { id: "cart_barcode", label: "{cart_barcode}", token: "{cart_barcode}" },
      { id: "cart_capacity", label: "{cart_capacity}", token: "{cart_capacity}" },
      { id: "cart_weight", label: "{cart_weight}", token: "{cart_weight}" },
      { id: "cart_sections", label: "{cart_sections}", token: "{cart_sections}" },
    ],
  },
  {
    id: "basket",
    label: "Basket",
    items: [
      { id: "basket_id", label: "{basket_id}", token: "{basket_id}" },
      { id: "basket_code", label: "{basket_code}", token: "{basket_code}" },
      { id: "basket_barcode", label: "{basket_barcode}", token: "{basket_barcode}" },
      { id: "basket_level", label: "{basket_level}", token: "{basket_level}" },
      { id: "basket_position", label: "{basket_position}", token: "{basket_position}" },
      { id: "basket_cart_id", label: "{cart_id}", token: "{cart_id}" },
    ],
  },
  {
    id: "fleet",
    label: "Wózki (legacy)",
    items: [
      { id: "cart_id", label: "{cart_id}", token: "{cart_id}" },
      { id: "cart_barcode", label: "{cart_barcode}", token: "{cart_barcode}" },
      { id: "load_capacity", label: "{load_capacity}", token: "{load_capacity}" },
    ],
  },
  {
    id: "products",
    label: "Produkty",
    items: [
      { id: "prod_name", label: "{prod_name}", token: "{prod_name}" },
      { id: "sku", label: "{sku}", token: "{sku}" },
      { id: "ean", label: "{ean}", token: "{ean}" },
    ],
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
];

/** Which variable categories to show for each template type. */
export const TEMPLATE_TYPE_CATEGORIES: Record<TemplateType, VariableCategoryId[]> = {
  location: ["warehouse"],
  product: ["products"],
  cart: ["cart", "fleet"],
  basket: ["basket", "cart"],
  order: ["orders"],
};

/** Preview data type for template editor. */
export type PreviewDataType = "location" | "cart" | "basket" | "product" | "order";

/** Sample records per preview type for realistic barcode/text preview in the template editor. */
export const PREVIEW_SAMPLES: Record<PreviewDataType, Record<string, unknown>> = {
  location: {
    location_name: "A-01-02-03",
    rack_id: "A01",
    level: 2,
    zone_name: "Magazyn",
    volume_capacity: 120,
    barcode_data: "A1-02-03",
    loc_barcode: "A1-02-03",
    location_barcode: "A1-02-03",
    storage_type: "primary",
    "{loc_name}": "A-01-02-03",
    "{loc_barcode}": "A1-02-03",
    "{zone}": "Magazyn",
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
    "{prod_name}": "Karton 40x30x25",
    "{sku}": "KAR-40-01",
    "{ean}": "5901234123457",
    "{product_barcode}": "5901234123457",
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
}

export interface LineElement extends LabelElementBase {
  type: "line";
  strokeWidth?: number;
}

export interface RectElement extends LabelElementBase {
  type: "rect";
  strokeWidth?: number;
  fill?: string;
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
  elements: LabelElement[];
}

/** Repeater: repeat template along horizontal or vertical (e.g. rack levels). */
export interface RepeaterElement {
  id: string;
  type: "repeater";
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  /** Binding for array data, e.g. "levels" */
  dataset: string;
  direction: "horizontal" | "vertical";
  itemWidth: number;
  itemHeight?: number;
  template: { elements: LabelElement[] };
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
  storage_type?: "primary" | "reserve";
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
