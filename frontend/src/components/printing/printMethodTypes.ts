/** Shared print method ids for PrintMethodDialog / usePrintMethodFlow. */
export type PrintMethod = "agent" | "browser" | "download" | "qz" | "cloud";

export type PrintMethodKind = "a4" | "label" | "receipt";

export type PrintMethodHandlers = {
  /** Browser print dialog (PDF viewer + window.print / current print shell). */
  onBrowserPrint: () => void | Promise<void>;
  /**
   * Sasist Agent queue for the chosen workstation.
   * `workstationId` is always set when called from usePrintMethodFlow Agent path.
   */
  onCloudPrint: (workstationId: number) => void | Promise<void>;
  /** Alias for onCloudPrint. */
  onAgentPrint?: (workstationId: number) => void | Promise<void>;
  /** Download PDF file. */
  onDownloadPdf: () => void | Promise<void>;
  /** Stage 5 Cleanup: remove after QZ retirement. */
  onQzPrint?: () => void | Promise<void>;
};
