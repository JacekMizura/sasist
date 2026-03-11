/**
 * Shared label layout engine – single source of truth for label rendering.
 * Designer, preview grid, and PDF all consume the same computed layout.
 * Coordinate system: millimeters, origin top-left.
 */

import type {
  LabelTemplate,
  TemplateElement,
  LabelElement,
  GroupElement,
  RepeaterElement,
  BarcodeTextPosition,
  DynamicBinding,
  LabelRecord,
} from "../types/labelSystem";

export type HorizontalAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";

/** Single computed layout item (flat list after expanding groups/repeaters). */
export interface LayoutItem {
  id: string;
  type: "text" | "barcode" | "rect" | "line" | "section" | "image" | "icon" | "triangle" | "arrow" | "polygon";
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  rotation?: number;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  /** Text content (resolved for dynamicText) */
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  horizontalAlign?: HorizontalAlign;
  verticalAlign?: VerticalAlign;
  verticalText?: boolean;
  /** Barcode */
  barcodeValue?: string;
  barcodeFormat?: string;
  showValue?: boolean;
  textPosition?: BarcodeTextPosition;
  /** Shapes */
  strokeWidth?: number;
  fill?: string;
  borderWidth?: number;
  /** Icon */
  icon?: string;
  /** Image */
  src?: string;
  /** Section */
  /** Triangle/arrow/polygon variants */
  variant?: string;
  direction?: string;
  points?: string;
}

function resolveBinding(record: Record<string, unknown>, binding: DynamicBinding): string {
  if (!binding || typeof binding !== "string") return "";
  const key = binding.trim();
  if (!key) return "";
  let val = record[key];
  if (val != null) return String(val);
  const bare = key.startsWith("{") && key.endsWith("}") ? key.slice(1, -1).trim() : key;
  val = record[bare] ?? record[`{${bare}}`];
  return val != null ? String(val) : "";
}

function resolveBarcodeValue(record: Record<string, unknown>, dataBinding: string): string {
  let v = resolveBinding(record, dataBinding as DynamicBinding);
  if (v) return v;
  for (const k of ["barcode_data", "loc_barcode", "location_barcode", "cart_barcode", "basket_barcode", "product_barcode", "order_barcode", "location_code"]) {
    v = record[k] != null ? String(record[k]) : "";
    if (v) return v;
  }
  return "";
}

function normalizeAlign(a?: string): HorizontalAlign {
  const s = (a || "left").toLowerCase();
  if (s === "center" || s === "right") return s;
  return "left";
}

function normalizeVerticalAlign(a?: string): VerticalAlign {
  const s = (a || "middle").toLowerCase();
  if (s === "top" || s === "bottom") return s;
  return "middle";
}

function elementToLayoutItem(
  el: LabelElement,
  x0_mm: number,
  y0_mm: number,
  record: Record<string, unknown>
): LayoutItem | null {
  const x_mm = x0_mm + el.x;
  const y_mm = y0_mm + el.y;
  const width_mm = Math.max(0.5, el.width);
  const height_mm = Math.max(0.5, el.height);
  const rawRotation = typeof el.rotation === "number" ? el.rotation : 0;
  const rotation = ((rawRotation % 360) + 360) % 360;
  const backgroundColor = el.backgroundColor;
  const borderColor = el.borderColor;
  const textColor = el.textColor ?? "#000000";

  const base: LayoutItem = {
    id: el.id,
    type: mapElementTypeToLayoutType(el.type),
    x_mm,
    y_mm,
    width_mm,
    height_mm,
    rotation,
    backgroundColor,
    borderColor,
    textColor,
  };

  switch (el.type) {
    case "barcode": {
      const value = resolveBarcodeValue(record, el.dataBinding);
      return {
        ...base,
        type: "barcode",
        barcodeValue: value || "SAMPLE",
        barcodeFormat: el.format || "Code128",
        showValue: el.showValue === true,
        textPosition: el.textPosition ?? "below",
      };
    }
    case "dynamicText": {
      const text = resolveBinding(record, el.binding) || `{${el.binding}}`;
      return {
        ...base,
        type: "text",
        text,
        fontSize: el.fontSize ?? 10,
        fontFamily: el.fontFamily,
        bold: el.bold,
        horizontalAlign: normalizeAlign(el.align),
        verticalAlign: normalizeVerticalAlign((el as { verticalAlign?: string }).verticalAlign),
        verticalText: el.verticalText,
      };
    }
    case "staticText": {
      return {
        ...base,
        type: "text",
        text: el.text ?? "",
        fontSize: el.fontSize ?? 8,
        fontFamily: el.fontFamily,
        bold: el.bold,
        horizontalAlign: normalizeAlign(el.align),
        verticalAlign: normalizeVerticalAlign((el as { verticalAlign?: string }).verticalAlign),
        verticalText: el.verticalText,
      };
    }
    case "line": {
      return {
        ...base,
        type: "line",
        strokeWidth: el.strokeWidth ?? 0.5,
      };
    }
    case "rect": {
      const rect = el as { fill?: string; strokeWidth?: number };
      return {
        ...base,
        type: "rect",
        fill: rect.fill,
        strokeWidth: rect.strokeWidth ?? 0.5,
      };
    }
    case "section": {
      const sec = el as { borderWidth?: number };
      return {
        ...base,
        type: "section",
        borderWidth: sec.borderWidth ?? 0.5,
      };
    }
    case "statusIcon": {
      return {
        ...base,
        type: "icon",
        icon: el.icon ?? "none",
      };
    }
    case "triangle": {
      const tri = el as { variant?: string };
      return { ...base, type: "triangle", variant: tri.variant };
    }
    case "arrow": {
      const arr = el as { direction?: string };
      return { ...base, type: "arrow", direction: arr.direction };
    }
    case "polygon": {
      const poly = el as { points?: string };
      return { ...base, type: "polygon", points: poly.points };
    }
    case "image": {
      return {
        ...base,
        type: "image",
        src: el.src ?? "",
      };
    }
    default:
      return base;
  }
}

function mapElementTypeToLayoutType(
  t: string
): "text" | "barcode" | "rect" | "line" | "section" | "image" | "icon" | "triangle" | "arrow" | "polygon" {
  const map: Record<string, LayoutItem["type"]> = {
    barcode: "barcode",
    dynamicText: "text",
    staticText: "text",
    line: "line",
    rect: "rect",
    section: "section",
    statusIcon: "icon",
    image: "image",
    triangle: "triangle",
    arrow: "arrow",
    polygon: "polygon",
  };
  return map[t] ?? "rect";
}

function flattenElements(
  elements: TemplateElement[],
  record: Record<string, unknown>,
  labelWidthMm: number,
  labelHeightMm: number,
  x0_mm: number,
  y0_mm: number,
  out: LayoutItem[]
): void {
  for (const el of elements) {
    if (el.type === "group") {
      const group = el as GroupElement;
      const gx = Math.max(0, Math.min(group.x, labelWidthMm - 0.5));
      const gy = Math.max(0, Math.min(group.y, labelHeightMm - 0.5));
      const nested = group.elements ?? [];
      flattenElements(nested, record, labelWidthMm, labelHeightMm, x0_mm + gx, y0_mm + gy, out);
      continue;
    }
    if (el.type === "repeater") {
      const rep = el as RepeaterElement;
      const items = (record[rep.dataset] as unknown[]) ?? [];
      const template = rep.template?.elements ?? [];
      const itemW = rep.itemWidth ?? 20;
      const itemH = rep.itemHeight ?? rep.itemWidth ?? 20;
      const dir = rep.direction === "vertical";
      let cx = x0_mm + rep.x;
      let cy = y0_mm + rep.y;
      for (const item of items) {
        const itemData = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
        flattenElements(template, itemData, labelWidthMm, labelHeightMm, cx, cy, out);
        if (dir) cy += itemH;
        else cx += itemW;
      }
      continue;
    }
    const item = elementToLayoutItem(el as LabelElement, x0_mm, y0_mm, record);
    if (item) {
      item.x_mm = Math.max(0, Math.min(item.x_mm, labelWidthMm - item.width_mm));
      item.y_mm = Math.max(0, Math.min(item.y_mm, labelHeightMm - item.height_mm));
      out.push(item);
    }
  }
}

export interface ComputeLayoutInput {
  labelWidthMm: number;
  labelHeightMm: number;
  elements: TemplateElement[];
  record?: Record<string, unknown>;
}

/**
 * Compute flat layout items from template and optional record.
 * All coordinates in mm, origin top-left. Used by designer, preview, and (mirrored in backend) PDF.
 */
export function computeLayout(input: ComputeLayoutInput): LayoutItem[] {
  const { labelWidthMm, labelHeightMm, elements, record = {} } = input;
  const out: LayoutItem[] = [];
  flattenElements(elements, record, labelWidthMm, labelHeightMm, 0, 0, out);
  return out;
}

/**
 * Convenience: compute layout from a full LabelTemplate and record.
 */
export function computeLayoutFromTemplate(
  template: LabelTemplate,
  record?: LabelRecord | Record<string, unknown>
): LayoutItem[] {
  return computeLayout({
    labelWidthMm: template.widthMm,
    labelHeightMm: template.heightMm,
    elements: template.elements,
    record: (record ?? {}) as Record<string, unknown>,
  });
}

/** Scale factor: px per mm. Use for designer (e.g. 400/80 = 5) or preview (120/80 = 1.5). */
export function scaleToPx(item: LayoutItem, scalePxPerMm: number) {
  return {
    left: item.x_mm * scalePxPerMm,
    top: item.y_mm * scalePxPerMm,
    width: item.width_mm * scalePxPerMm,
    height: item.height_mm * scalePxPerMm,
  };
}
