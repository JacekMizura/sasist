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

export type VariableCategoryId = "warehouse" | "fleet" | "products" | "orders";
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
    id: "fleet",
    label: "Wózki",
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

export type LabelElementKind =
  | "barcode"
  | "dynamicText"
  | "staticText"
  | "image"
  | "line"
  | "rect"
  | "statusIcon";

export type StatusIconType = "lock" | "heavy_load" | "hazard" | "arrow_up" | "arrow_down" | "arrow_left" | "arrow_right" | "none";

export interface LabelElementBase {
  id: string;
  type: LabelElementKind;
  x: number; // mm
  y: number;
  width: number;
  height: number;
  rotation?: number;
  /** Background fill color (hex). Applied to text/shape background. */
  backgroundColor?: string;
  /** Text/foreground color (hex). Applied to text and shape stroke. */
  textColor?: string;
}

export interface BarcodeElement extends LabelElementBase {
  type: "barcode";
  format: BarcodeFormat;
  /** Binding for data (e.g. barcode_data or location_name) */
  dataBinding: DynamicBinding;
  showValue?: boolean;
}

export interface DynamicTextElement extends LabelElementBase {
  type: "dynamicText";
  binding: DynamicBinding;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
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

export interface StatusIconElement extends LabelElementBase {
  type: "statusIcon";
  icon: StatusIconType;
  /** When to show: e.g. reserve -> lock, bottom level -> heavy_load */
  condition?: "reserve" | "bottom_level" | "always";
}

export type LabelElement =
  | BarcodeElement
  | DynamicTextElement
  | StaticTextElement
  | ImageElement
  | LineElement
  | RectElement
  | StatusIconElement;

export interface LabelTemplate {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  elements: LabelElement[];
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
  location_name: string;
  rack_id: string;
  level: number;
  zone_name?: string;
  volume_capacity?: number;
  barcode_data: string;
  storage_type?: "primary" | "reserve";
  aisle_letter?: string;
  rack_index?: number;
  isBottomLevel?: boolean;
  /** V2: allow extended variables like "{loc_name}" */
  [key: string]: unknown;
}
