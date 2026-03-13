import type {
  LabelTemplate,
  TemplateElement,
  StaticTextElement,
  DynamicTextElement,
  RectElement,
  LineElement,
  ImageElement,
} from "../types/labelSystem";

const DEFAULT_DPI = 96;

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function pxToMm(px: number, dpi: number): number {
  return (px * 25.4) / dpi;
}

function parseNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

function parseLengthToMm(raw: string | null, dpi: number): number | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  const match = value.match(/^([-+]?[\d.]+)([a-z%]*)$/i);
  if (!match) {
    const n = Number(value);
    return Number.isFinite(n) ? pxToMm(n, dpi) : null;
  }

  const num = Number(match[1]);
  if (!Number.isFinite(num)) return null;
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "mm":
      return num;
    case "cm":
      return num * 10;
    case "in":
      return num * 25.4;
    case "pt": {
      // 1 pt = 1/72 in
      const px = (num * dpi) / 72;
      return pxToMm(px, dpi);
    }
    case "px":
    case "":
      return pxToMm(num, dpi);
    default:
      // Fallback: treat as px
      return pxToMm(num, dpi);
  }
}

function parseFontSizeToPt(raw: string | null, dpi: number): number {
  if (!raw) return 10;
  const value = raw.trim();
  if (!value) return 10;

  const match = value.match(/^([-+]?[\d.]+)([a-z%]*)$/i);
  if (!match) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 10;
  }

  const num = Number(match[1]);
  if (!Number.isFinite(num)) return 10;
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "pt":
      return num;
    case "px":
    case "": {
      // px → pt using dpi
      return (num * 72) / dpi;
    }
    case "mm": {
      // 1 pt ≈ 0.3528 mm
      return num / 0.3528;
    }
    case "cm": {
      return (num * 10) / 0.3528;
    }
    case "in": {
      return (num * 25.4) / 0.3528;
    }
    default:
      return num;
  }
}

function extractLabelSize(svg: SVGSVGElement, dpi: number): { widthMm: number; heightMm: number } {
  let widthMm = parseLengthToMm(svg.getAttribute("width"), dpi);
  let heightMm = parseLengthToMm(svg.getAttribute("height"), dpi);

  const viewBox = svg.getAttribute("viewBox");
  if ((!widthMm || !heightMm) && viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/);
    if (parts.length === 4) {
      const viewW = Number(parts[2]);
      const viewH = Number(parts[3]);
      if (Number.isFinite(viewW) && !widthMm) {
        widthMm = pxToMm(viewW, dpi);
      }
      if (Number.isFinite(viewH) && !heightMm) {
        heightMm = pxToMm(viewH, dpi);
      }
    }
  }

  // Fallback sensible defaults if size cannot be determined
  if (!widthMm || !heightMm) {
    return { widthMm: widthMm || 100, heightMm: heightMm || 50 };
  }

  return { widthMm, heightMm };
}

function parseTextElement(el: SVGTextElement, dpi: number): TemplateElement | null {
  const xMm = parseLengthToMm(el.getAttribute("x"), dpi) ?? 0;
  const yMm = parseLengthToMm(el.getAttribute("y"), dpi) ?? 0;

  const rawText = (el.textContent ?? "").trim();
  if (!rawText) return null;

  const fontSizePt = parseFontSizeToPt(el.getAttribute("font-size"), dpi);
  const fontSizeMm = fontSizePt * 0.35;
  const estCharWidthMm = fontSizeMm * 0.6;
  const estimatedWidthMm = Math.max(fontSizeMm * 1.5, rawText.length * estCharWidthMm);
  const estimatedHeightMm = Math.max(fontSizeMm * 1.2, fontSizeMm);

  const variableMatch = rawText.match(/^\{[^}]+\}$/);

  if (variableMatch) {
    const binding = variableMatch[0];
    const elDyn: DynamicTextElement = {
      id: uuid(),
      type: "dynamicText",
      x: xMm,
      y: yMm,
      width: estimatedWidthMm,
      height: estimatedHeightMm,
      binding,
      fontSize: fontSizePt,
      align: "left",
      verticalText: false,
    };
    return elDyn;
  }

  const elStatic: StaticTextElement = {
    id: uuid(),
    type: "staticText",
    x: xMm,
    y: yMm,
    width: estimatedWidthMm,
    height: estimatedHeightMm,
    text: rawText,
    fontSize: fontSizePt,
    align: "left",
    verticalText: false,
  };
  return elStatic;
}

function parseRectElement(el: SVGRectElement, dpi: number): TemplateElement | null {
  const xMm = parseLengthToMm(el.getAttribute("x"), dpi) ?? 0;
  const yMm = parseLengthToMm(el.getAttribute("y"), dpi) ?? 0;
  const widthMm = parseLengthToMm(el.getAttribute("width"), dpi);
  const heightMm = parseLengthToMm(el.getAttribute("height"), dpi);
  if (!widthMm || !heightMm) return null;

  const fill = el.getAttribute("fill") || undefined;
  const stroke = el.getAttribute("stroke") || undefined;
  const strokeWidth = parseLengthToMm(el.getAttribute("stroke-width"), dpi) ?? undefined;

  const rect: RectElement = {
    id: uuid(),
    type: "rect",
    x: xMm,
    y: yMm,
    width: widthMm,
    height: heightMm,
    fill: fill === "none" ? undefined : fill,
    borderColor: stroke === "none" ? undefined : stroke,
    strokeWidth,
  };
  return rect;
}

function parseLineElement(el: SVGLineElement, dpi: number): TemplateElement | null {
  const x1 = parseLengthToMm(el.getAttribute("x1"), dpi) ?? 0;
  const y1 = parseLengthToMm(el.getAttribute("y1"), dpi) ?? 0;
  const x2 = parseLengthToMm(el.getAttribute("x2"), dpi) ?? 0;
  const y2 = parseLengthToMm(el.getAttribute("y2"), dpi) ?? 0;

  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1) || 0.5;

  const stroke = el.getAttribute("stroke") || undefined;
  const strokeWidth = parseLengthToMm(el.getAttribute("stroke-width"), dpi) ?? undefined;

  const line: LineElement = {
    id: uuid(),
    type: "line",
    x,
    y,
    width,
    height,
    borderColor: stroke === "none" ? undefined : stroke,
    strokeWidth,
  };
  return line;
}

function parseImageElement(el: SVGImageElement, dpi: number): TemplateElement | null {
  const xMm = parseLengthToMm(el.getAttribute("x"), dpi) ?? 0;
  const yMm = parseLengthToMm(el.getAttribute("y"), dpi) ?? 0;
  const widthMm = parseLengthToMm(el.getAttribute("width"), dpi);
  const heightMm = parseLengthToMm(el.getAttribute("height"), dpi);
  if (!widthMm || !heightMm) return null;

  const href =
    el.getAttribute("href") ||
    el.getAttribute("xlink:href") ||
    el.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
    undefined;
  if (!href) return null;

  const img: ImageElement = {
    id: uuid(),
    type: "image",
    x: xMm,
    y: yMm,
    width: widthMm,
    height: heightMm,
    src: href,
  };
  return img;
}

export function importSvgTemplate(svgText: string): LabelTemplate {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");

  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Invalid SVG");
  }

  const svg = doc.querySelector("svg") as SVGSVGElement | null;
  if (!svg) {
    throw new Error("Invalid SVG");
  }

  const dpiAttr =
    svg.getAttribute("data-dpi") ||
    svg.getAttribute("dpi") ||
    svg.getAttribute("inkscape:export-xdpi") ||
    svg.getAttribute("x-dpi");
  const parsedDpi = dpiAttr ? parseNumber(dpiAttr) : null;
  const dpi = parsedDpi && parsedDpi > 0 ? parsedDpi : DEFAULT_DPI;

  const { widthMm, heightMm } = extractLabelSize(svg, dpi);

  const elements: TemplateElement[] = [];

  const textNodes = svg.querySelectorAll("text");
  textNodes.forEach((node) => {
    const el = parseTextElement(node as SVGTextElement, dpi);
    if (el) elements.push(el);
  });

  const rectNodes = svg.querySelectorAll("rect");
  rectNodes.forEach((node) => {
    const el = parseRectElement(node as SVGRectElement, dpi);
    if (el) elements.push(el);
  });

  const lineNodes = svg.querySelectorAll("line");
  lineNodes.forEach((node) => {
    const el = parseLineElement(node as SVGLineElement, dpi);
    if (el) elements.push(el);
  });

  const imageNodes = svg.querySelectorAll("image");
  imageNodes.forEach((node) => {
    const el = parseImageElement(node as SVGImageElement, dpi);
    if (el) elements.push(el);
  });

  const template: LabelTemplate = {
    id: uuid(),
    name: "Imported SVG",
    widthMm,
    heightMm,
    dpi: 300,
    template_type: "location",
    elements,
  };

  return template;
}

