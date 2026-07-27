/** Shared print method ids for PrintMethodDialog / usePrintMethodFlow. */
export type PrintMethod = "agent" | "browser" | "download" | "qz" | "cloud";

export type PrintMethodKind = "a4" | "label" | "receipt";

export type PrintMethodHandlers = {
  /** Browser print dialog (PDF viewer + window.print / current print shell). */
  onBrowserPrint: () => void | Promise<void>;
  /** Sasist Agent queue (default or selected agent printer). */
  onCloudPrint: () => void | Promise<void>;
  /** @deprecated alias — same as onCloudPrint (Sasist Agent). */
  onAgentPrint?: () => void | Promise<void>;
  /** Download PDF file. */
  onDownloadPdf: () => void | Promise<void>;
  /** Stage 5 Cleanup: remove after QZ retirement. */
  onQzPrint?: () => void | Promise<void>;
};
