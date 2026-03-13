import type { LabelTemplate, LabelElement, RepeaterElement } from "../../types/labelSystem";
import { pxToMm } from "../utils/pxToMm";
import type { Segment } from "../imageAnalysis/computeSegments";
import { createSlice } from "./createBackgroundSlice";

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildRepeaterTemplate(
  segments: Segment[],
  canvas: HTMLCanvasElement,
  dpi: number
): LabelTemplate {
  const widthPx = canvas.width;
  const heightPx = canvas.height;
  const widthMm = pxToMm(widthPx, dpi);
  const heightMm = pxToMm(heightPx, dpi);
  const first = segments[0] ?? { startX: 0, endX: widthPx };
  const segWidthPx = Math.max(1, first.endX - first.startX);
  const itemWidthMm = pxToMm(segWidthPx, dpi);
  const sliceUrl = createSlice(canvas, first.startX, first.endX, heightPx);

  const backgroundImage: LabelElement = {
    id: uuid(),
    type: "image",
    x: 0,
    y: 0,
    width: itemWidthMm,
    height: heightMm,
    src: sliceUrl,
    zIndex: -1000,
  } as LabelElement;

  const textEl: LabelElement = {
    id: uuid(),
    type: "dynamicText",
    x: 2,
    y: heightMm * 0.15,
    width: itemWidthMm - 4,
    height: heightMm * 0.2,
    binding: "location_code",
    fontSize: 10,
    align: "center",
  } as LabelElement;

  const barcodeEl: LabelElement = {
    id: uuid(),
    type: "barcode",
    x: 4,
    y: heightMm * 0.4,
    width: itemWidthMm - 8,
    height: heightMm * 0.45,
    format: "Code128",
    dataBinding: "location_barcode",
    showValue: false,
  } as LabelElement;

  const repeater: RepeaterElement = {
    id: uuid(),
    type: "repeater",
    x: 0,
    y: 0,
    width: widthMm,
    height: heightMm,
    dataset: "locations",
    direction: "horizontal",
    itemWidth: itemWidthMm,
    itemHeight: heightMm,
    template: {
      elements: [backgroundImage, textEl, barcodeEl],
    },
  };

  return {
    id: uuid(),
    name: "Imported PNG strip",
    widthMm,
    heightMm,
    dpi,
    template_type: "location",
    elements: [repeater],
  };
}

