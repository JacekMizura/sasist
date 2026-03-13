import type { LabelTemplate } from "../types/labelSystem";
import { loadImageToCanvas } from "./utils/loadImageToCanvas";
import { scanColumnBrightness } from "./imageAnalysis/brightnessScan";
import { detectSeparators } from "./imageAnalysis/detectSeparators";
import { computeSegments } from "./imageAnalysis/computeSegments";
import { buildRepeaterTemplate } from "./templateBuilder/buildRepeaterTemplate";
import { createBackgroundTemplate } from "./templateBuilder/createBackgroundTemplate";

type ImportPngOptions = {
  autoSlice?: boolean;
  dpi?: number;
};

export async function importPngTemplate(
  file: File,
  options?: ImportPngOptions
): Promise<LabelTemplate> {
  const { canvas, ctx, widthPx, heightPx } = await loadImageToCanvas(file);

  const autoSlice = options?.autoSlice ?? false;
  const dpi = options?.dpi && options.dpi > 0 ? options.dpi : 300;

  if (!autoSlice) {
    return createBackgroundTemplate(canvas, widthPx, heightPx, dpi);
  }

  const brightness = scanColumnBrightness(ctx, widthPx, heightPx);
  const separators = detectSeparators(brightness);
  const segments = computeSegments(widthPx, separators);

  return buildRepeaterTemplate(segments, canvas, dpi);
}
