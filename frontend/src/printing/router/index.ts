/**
 * PrintingRouter — single decision point for Sasist Agent / QZ / browser / PDF download.
 * Stage 5 Cleanup: drop QZ transport after warehouse fleet is on Agent.
 */

export type {
  FallbackReason,
  PrintFormat,
  PrintRouteDecision,
  PrintTransport,
  ResolvePrintRouteInput,
} from "./types";
export { resolvePrintRoute } from "./resolvePrintRoute";
export { executePdfLabelPrint, PrintingRouter } from "./executePdfLabelPrint";
export {
  getPrintTelemetry,
  resetPrintTelemetry,
  trackFallbackReason,
  trackPrintedVia,
} from "./telemetry";
