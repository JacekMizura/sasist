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
  ImageElement,
} from "../types/labelSystem";
import { injectParsedLocationFields } from "./parseLocation";

/** Editor-only layout tweaks (do not use for final PDF / print when placeholders must be absent). */
export type ComputeLayoutOptions = {
  /** When set, empty dynamic text bindings show this string instead of raw `{token}` or blank collapse. */
  editorEmptyBindingPlaceholder?: string;
};

const LABEL_EDITOR_MISSING_IMAGE_PLACEHOLDER =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect fill="#e2e8f0" width="120" height="80" rx="4"/><text x="60" y="44" text-anchor="middle" font-size="10" font-family="system-ui,sans-serif" fill="#64748b">Brak zdjęcia</text></svg>`,
  );

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
  qrMargin?: number;
  qrErrorCorrection?: "L" | "M" | "Q" | "H";
  qrDarkColor?: string;
  qrLightColor?: string;
  qrTransparentBg?: boolean;
  qrAutoScale?: boolean;
  qrKeepAspect?: boolean;
  qrHighQuality?: boolean;
  /** Shapes */
  strokeWidth?: number;
  fill?: string;
  borderWidth?: number;
  /** Rounded rect (type === "rect"), mm */
  cornerRadius_mm?: number;
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

function bindingValueToString(val: unknown): string {
  if (val == null) return "";
  if (Array.isArray(val)) return "";
  if (typeof val === "object") return "";
  return String(val);
}

function resolveBinding(record: Record<string, unknown>, binding: DynamicBinding): string {
  if (!binding || typeof binding !== "string") return "";
  const key = binding.trim();
  if (!key) return "";
  let val = record[key];
  if (val != null) return bindingValueToString(val);
  const bare = key.startsWith("{") && key.endsWith("}") ? key.slice(1, -1).trim() : key;
  val = record[bare] ?? record[`{${bare}}`];
  return val != null ? bindingValueToString(val) : "";
}

function resolveBarcodeValue(record: Record<string, unknown>, dataBinding: string): string {
  let v = resolveBinding(record, dataBinding as DynamicBinding);
  if (v) return v;
  for (const k of ["barcode_data", "loc_barcode", "location_barcode", "cart_barcode", "basket_barcode", "product_barcode", "order_barcode", "location_code"]) {
    const raw = record[k];
    v = raw != null ? bindingValueToString(raw) : "";
    if (v) return v;
  }
  return "";
}

function interpolateTemplateString(templateValue: string, record: Record<string, unknown>): string {
  if (!templateValue) return "";
  return templateValue.replace(/\{([^}]+)\}/g, (_m, keyRaw) => {
    const key = String(keyRaw ?? "").trim();
    if (!key) return "";
    const v = record[key] ?? record[`{${key}}`];
    return v == null ? "" : String(v);
  });
}

/** True if `record` defines this binding key (bare or `{key}`). */
export function recordHasConditionKey(record: Record<string, unknown>, key: string): boolean {
  if (!key) return false;
  return (
    Object.prototype.hasOwnProperty.call(record, key) ||
    Object.prototype.hasOwnProperty.call(record, `{${key}}`)
  );
}

export type EvaluateConditionOptions = {
  /** Used for optional key remap (e.g. location: level → loc_name when level missing). */
  templateType?: string | null;
};

function resolveConditionKey(
  rawKey: string,
  record: Record<string, unknown>,
  templateType: string | undefined | null,
): string {
  if (recordHasConditionKey(record, rawKey)) return rawKey;
  const tt = (templateType ?? "").toLowerCase();
  if (tt === "location" && rawKey === "level" && recordHasConditionKey(record, "loc_name")) {
    console.warn(
      'Invalid condition key: "level" is not on this record. Using "loc_name" for location template (adjust RHS to match loc_name if needed).',
    );
    return "loc_name";
  }
  if (rawKey === "level" && recordHasConditionKey(record, "loc_name")) {
    console.warn('Invalid condition key: "level". Suggested replacement: "loc_name"');
  } else {
    console.warn("Invalid condition key:", rawKey);
  }
  return rawKey;
}

/**
 * Simple condition evaluator for visibleIf / rect conditions. Supports: {field} == value, != value, > value, < value.
 * Value can be quoted string ('x' or "x") or number. No full expression engine.
 */
export function evaluateCondition(
  expression: string,
  record: Record<string, unknown>,
  options?: EvaluateConditionOptions,
): boolean {
  const s = (expression ?? "").trim();
  if (!s) return true;
  const match = s.match(/^\s*(\{[^}]+\}|[a-zA-Z_][a-zA-Z0-9_]*)\s*(==|!=|>|<)\s*(.+)\s*$/s);
  if (!match) return true;
  const [, leftKey, op, rightRaw] = match;
  const rawKey = (leftKey ?? "").replace(/^\{|\}$/g, "").trim();
  const key = resolveConditionKey(rawKey, record, options?.templateType);
  const fieldVal = record[key] ?? record[`{${key}}`];
  const strVal = fieldVal != null ? String(fieldVal) : "";
  let rightVal: string | number = (rightRaw ?? "").trim();
  if ((rightVal.startsWith("'") && rightVal.endsWith("'")) || (rightVal.startsWith('"') && rightVal.endsWith('"'))) {
    rightVal = rightVal.slice(1, -1);
  } else {
    const num = Number(rightVal);
    if (!Number.isNaN(num) && String(num) === rightVal) rightVal = num;
  }
  let result = true;
  if (op === "==") result = strVal === String(rightVal);
  else if (op === "!=") result = strVal !== String(rightVal);
  else {
    const leftNum = Number(fieldVal);
    const rightNum = Number(rightVal);
    if (op === ">")
      result =
        !Number.isNaN(leftNum) && !Number.isNaN(rightNum)
          ? leftNum > rightNum
          : strVal.localeCompare(String(rightVal)) > 0;
    else if (op === "<")
      result =
        !Number.isNaN(leftNum) && !Number.isNaN(rightNum)
          ? leftNum < rightNum
          : strVal.localeCompare(String(rightVal)) < 0;
  }
  if (import.meta.env.DEV) {
    console.log("CONDITION CHECK:", {
      key: rawKey,
      effectiveKey: key,
      recordValue: strVal,
      expected: rightVal,
      result,
    });
  }
  return result;
}

/** CSS px to mm at 96 DPI (1 inch = 96 px = 25.4 mm). */
const MM_PER_PX = 25.4 / 96;

/** PostScript points per mm (matches backend label_engine.POINTS_PER_MM). */
const PT_PER_MM = 72 / 25.4;

/**
 * Measure text width in mm using canvas. Mirrors backend stringWidth behavior for auto-fit.
 */
function measureTextWidth(text: string, fontSize: number, bold?: boolean): number {
  if (!text) return 0;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  /** fontSize is in points (same as PDF); canvas uses CSS px at 96 dpi → 1 pt = 96/72 px */
  const fontPx = (fontSize * 96) / 72;
  const font = `${bold ? "bold " : ""}${fontPx}px sans-serif`;
  ctx.font = font;
  const widthPx = ctx.measureText(text).width;
  return widthPx * MM_PER_PX;
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
  record: Record<string, unknown>,
  templateType: string | null | undefined,
  layoutOptions?: ComputeLayoutOptions,
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
      const qrDataMode = (el as {
        qrDataMode?: "dynamic" | "static" | "template" | "url";
      }).qrDataMode ?? "dynamic";
      const qrContent = (el as { qrContent?: string }).qrContent ?? "";
      let value =
        el.format === "QR" && qrDataMode !== "dynamic"
          ? qrDataMode === "template"
            ? interpolateTemplateString(qrContent, record)
            : qrContent
          : resolveBarcodeValue(record, el.dataBinding);
      if (!value) value = resolveBarcodeValue(record, el.dataBinding);
      return {
        ...base,
        type: "barcode",
        barcodeValue: value || "SAMPLE",
        barcodeFormat: el.format || "Code128",
        showValue: el.showValue === true,
        textPosition: el.textPosition ?? "below",
        qrMargin: (el as { qrMargin?: number }).qrMargin ?? 0,
        qrErrorCorrection: (el as { qrErrorCorrection?: "L" | "M" | "Q" | "H" }).qrErrorCorrection ?? "M",
        qrDarkColor: (el as { qrDarkColor?: string }).qrDarkColor ?? "#000000",
        qrLightColor: (el as { qrLightColor?: string }).qrLightColor ?? "#ffffff",
        qrTransparentBg: (el as { qrTransparentBg?: boolean }).qrTransparentBg ?? false,
        qrAutoScale: (el as { qrAutoScale?: boolean }).qrAutoScale ?? true,
        qrKeepAspect: (el as { qrKeepAspect?: boolean }).qrKeepAspect ?? true,
        qrHighQuality: (el as { qrHighQuality?: boolean }).qrHighQuality ?? true,
      };
    }
    case "dynamicText":
    case "text": {
      const binding = (el as { binding?: string }).binding ?? (el as { dataBinding?: string }).dataBinding ?? "";
      const bare = binding.replace(/^\{|\}$/g, "").trim();
      const resolved = resolveBinding(record, binding as DynamicBinding);
      let text = resolved;
      if (!text && binding) {
        text = layoutOptions?.editorEmptyBindingPlaceholder ?? `{${bare}}`;
      }
      let fontSize = el.fontSize ?? 10;
      const ext = el as { autoFit?: boolean; minFontSize?: number; scaleToHeight?: boolean };
      if (ext.autoFit) {
        const minFontSize = Math.max(1, ext.minFontSize ?? 6);
        while (measureTextWidth(text, fontSize, el.bold) > width_mm && fontSize > minFontSize) {
          fontSize -= 0.5;
        }
        fontSize = Math.max(minFontSize, fontSize);
      } else if (ext.scaleToHeight) {
        fontSize = height_mm * PT_PER_MM * 0.7;
      }
      return {
        ...base,
        type: "text",
        text,
        fontSize,
        fontFamily: el.fontFamily,
        bold: el.bold,
        horizontalAlign: normalizeAlign(el.align),
        verticalAlign: normalizeVerticalAlign((el as { verticalAlign?: string }).verticalAlign),
        verticalText: el.verticalText,
      };
    }
    case "staticText": {
      let text = el.text ?? "";
      const staticPlaceholderMatch = text.match(/^\s*\{\{?([a-zA-Z0-9_]+)\}?\}\s*$/);
      if (staticPlaceholderMatch) {
        const varName = staticPlaceholderMatch[1];
        const resolved = resolveBinding(record, `{${varName}}`);
        if (resolved) text = resolved;
      }
      let fontSize = el.fontSize ?? 8;
      const ext = el as { autoFit?: boolean; minFontSize?: number; scaleToHeight?: boolean };
      if (ext.autoFit) {
        const minFontSize = Math.max(1, ext.minFontSize ?? 6);
        while (measureTextWidth(text, fontSize, el.bold) > width_mm && fontSize > minFontSize) {
          fontSize -= 0.5;
        }
        fontSize = Math.max(minFontSize, fontSize);
      } else if (ext.scaleToHeight) {
        fontSize = height_mm * PT_PER_MM * 0.7;
      }
      return {
        ...base,
        type: "text",
        text,
        fontSize,
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
      const rect = el as {
        fill?: string;
        backgroundColor?: string;
        strokeWidth?: number;
        cornerRadius?: number;
        conditions?: Array<{ if: string; fill?: string; stroke?: string }>;
      };
      let fill = rect.fill ?? rect.backgroundColor;
      let stroke: string | undefined;
      if (Array.isArray(rect.conditions)) {
        for (const cond of rect.conditions) {
          if (evaluateCondition(cond.if, record, { templateType })) {
            if (cond.fill != null) fill = cond.fill;
            if (cond.stroke != null) stroke = cond.stroke;
            break;
          }
        }
      }
      const rawR = typeof rect.cornerRadius === "number" && Number.isFinite(rect.cornerRadius) ? rect.cornerRadius : 0;
      const capR = Math.min(width_mm, height_mm) / 2;
      const cornerRadius_mm = Math.max(0, Math.min(rawR, capR));
      return {
        ...base,
        type: "rect",
        fill,
        strokeWidth: rect.strokeWidth ?? 0.5,
        cornerRadius_mm,
        ...(stroke != null ? { borderColor: stroke } : {}),
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
      const img = el as ImageElement;
      let src = "";
      const bind = (img.srcBinding ?? "").trim();
      if (bind) {
        src = resolveBinding(record, bind as DynamicBinding);
      }
      if (!src) src = img.src ?? "";
      if (!src && layoutOptions?.editorEmptyBindingPlaceholder) {
        src = LABEL_EDITOR_MISSING_IMAGE_PLACEHOLDER;
      }
      return {
        ...base,
        type: "image",
        src,
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
    text: "text",
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
  out: LayoutItem[],
  templateType: string | null | undefined,
  layoutOptions?: ComputeLayoutOptions,
): void {
  for (const el of elements) {
    if ((el as { visible?: boolean }).visible === false) continue;
    const visibleIf = (el as { visibleIf?: string }).visibleIf;
    if (visibleIf && !evaluateCondition(visibleIf, record, { templateType })) continue;

    if (el.type === "group") {
      const group = el as GroupElement;
      const gx = Math.max(0, Math.min(group.x, labelWidthMm - 0.5));
      const gy = Math.max(0, Math.min(group.y, labelHeightMm - 0.5));
      const nested = group.elements ?? [];
      flattenElements(nested, record, labelWidthMm, labelHeightMm, x0_mm + gx, y0_mm + gy, out, templateType, layoutOptions);
      continue;
    }
    if (el.type === "repeater") {
      const rep = el as RepeaterElement;
      let rawItems: unknown[] = (record[rep.dataset] as unknown[]) ?? [];
      rawItems = [...rawItems];
      /** Stable index in source array (before filter/sort). Use in repeater `filter`, e.g. `{dataset_index} == 0`. */
      let items: unknown[] = rawItems.map((item, dataset_index) => {
        if (typeof item === "object" && item !== null) {
          return { ...(item as Record<string, unknown>), dataset_index };
        }
        return {
          loc_name: item,
          location_name: item,
          location_code: item,
          value: item,
          dataset_index,
        };
      });
      const filterExpr = rep.filter?.trim();
      if (filterExpr) {
        items = items.filter((item) => {
          const rec = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
          return evaluateCondition(filterExpr, rec, { templateType });
        });
      }
      const sortBy = rep.sortBy?.trim();
      if (sortBy) {
        items.sort((a, b) => {
          const ra = typeof a === "object" && a !== null ? (a as Record<string, unknown>) : {};
          const rb = typeof b === "object" && b !== null ? (b as Record<string, unknown>) : {};
          const va = ra[sortBy] ?? ra[`{${sortBy}}`];
          const vb = rb[sortBy] ?? rb[`{${sortBy}}`];
          const na = Number(va);
          const nb = Number(vb);
          if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
          return String(va ?? "").localeCompare(String(vb ?? ""));
        });
      }
      const template = rep.template?.elements ?? [];
      const itemW = rep.itemWidth ?? 20;
      const itemH = rep.itemHeight ?? rep.itemWidth ?? 20;
      const baseX = x0_mm + rep.x;
      const baseY = y0_mm + rep.y;
      const useGrid = rep.layout === "grid";
      const columns = Math.max(1, rep.columns ?? 1);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemData: Record<string, unknown> =
          typeof item === "object" && item !== null
            ? { ...(item as Record<string, unknown>) }
            : { loc_name: item, location_name: item, location_code: item, value: item };
        /** Parent context without the iterable dataset array so slots do not re-read the full list / stringify arrays into text. */
        const datasetKey = (rep.dataset ?? "").trim();
        const parentForSlot: Record<string, unknown> = { ...record };
        if (datasetKey) delete parentForSlot[datasetKey];
        /** Item fields override parent; repeater_slot = index after filter/sort (dataset_index stays on item from source). */
        const childRecord = { ...parentForSlot, ...itemData, repeater_slot: i };
        injectParsedLocationFields(childRecord);
        let cx: number;
        let cy: number;
        if (useGrid) {
          const row = Math.floor(i / columns);
          const col = i % columns;
          cx = baseX + col * itemW;
          cy = baseY + row * itemH;
        } else {
          const dir = rep.direction === "vertical";
          cx = baseX + (dir ? 0 : i * itemW);
          cy = baseY + (dir ? i * itemH : 0);
        }
        flattenElements(template, childRecord, labelWidthMm, labelHeightMm, cx, cy, out, templateType, layoutOptions);
      }
      continue;
    }
    const item = elementToLayoutItem(el as LabelElement, x0_mm, y0_mm, record, templateType, layoutOptions);
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
  /** Matches template.template_type; used when resolving condition field keys. */
  templateType?: string | null;
  layoutOptions?: ComputeLayoutOptions;
}

/**
 * Compute flat layout items from template and optional record.
 * All coordinates in mm, origin top-left. Used by designer, preview, and (mirrored in backend) PDF.
 */
export function computeLayout(input: ComputeLayoutInput): LayoutItem[] {
  const { labelWidthMm, labelHeightMm, elements, record = {}, templateType, layoutOptions } = input;
  const out: LayoutItem[] = [];
  const rec: Record<string, unknown> = { ...record };
  injectParsedLocationFields(rec);
  flattenElements(elements, rec, labelWidthMm, labelHeightMm, 0, 0, out, templateType, layoutOptions);
  return out;
}

/**
 * Convenience: compute layout from a full LabelTemplate and record.
 */
export function computeLayoutFromTemplate(
  template: LabelTemplate,
  record?: LabelRecord | Record<string, unknown>,
  layoutOptions?: ComputeLayoutOptions,
): LayoutItem[] {
  return computeLayout({
    labelWidthMm: template.widthMm,
    labelHeightMm: template.heightMm,
    elements: template.elements,
    record: (record ?? {}) as Record<string, unknown>,
    templateType: template.template_type ?? null,
    layoutOptions,
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
