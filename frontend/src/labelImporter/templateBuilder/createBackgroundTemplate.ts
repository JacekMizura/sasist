import type { LabelTemplate, LabelElement } from "../../types/labelSystem";
import { pxToMm } from "../utils/pxToMm";

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createBackgroundTemplate(
  canvas: HTMLCanvasElement,
  widthPx: number,
  heightPx: number,
  dpi: number
): LabelTemplate {
  const widthMm = pxToMm(widthPx, dpi);
  const heightMm = pxToMm(heightPx, dpi);
  const dataUrl = canvas.toDataURL("image/png");

  const background: LabelElement = {
    id: uuid(),
    type: "image",
    x: 0,
    y: 0,
    width: widthMm,
    height: heightMm,
    src: dataUrl,
    zIndex: -1000,
  } as LabelElement;

  return {
    id: uuid(),
    name: "Imported PNG background",
    widthMm,
    heightMm,
    dpi,
    template_type: "location",
    elements: [background],
  };
}

