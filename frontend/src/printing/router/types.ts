/**
 * Central print routing — callers must not branch on QZ vs Agent themselves.
 * Stage 5 Cleanup: remove QZ branches from this module after cutover.
 */

export type PrintTransport = "agent" | "qz" | "browser" | "download";

export type PrintFormat = "pdf" | "zpl" | "raw" | "html";

export type FallbackReason =
  | "flag_off"
  | "no_warehouse"
  | "no_online_agent"
  | "unsupported_capability"
  | "no_default_printer"
  | "qz_unavailable"
  | "agent_error"
  | null;

export type PrintRouteDecision = {
  transport: PrintTransport;
  /** Gate capability required for Sasist Agent cutover (zpl = new agent stack). */
  gateFormat: PrintFormat;
  /** Actual job payload format. */
  jobFormat: PrintFormat;
  preferSasistAgent: boolean;
  agentId: number | null;
  printerId: number | null;
  fallbackReason: FallbackReason;
  supportedFormats: string[];
};

export type ResolvePrintRouteInput = {
  tenantId: number;
  warehouseId?: number | null;
  /** Capability that must be present on agent for Agent path (default zpl). */
  gateFormat?: PrintFormat;
  /** Format of the job payload (default pdf for Z-PZ / return labels). */
  jobFormat?: PrintFormat;
  /** Printer kind for defaults (label for cutover). */
  printerKind?: "a4" | "label" | "receipt";
};
