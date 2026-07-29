/** Shared print method ids for PrintMethodDialog / usePrintMethodFlow. */
export type PrintMethod = "agent" | "browser" | "download" | "qz" | "cloud";

export type PrintMethodKind = "a4" | "label" | "receipt";

export type PrintTemplateChoice = {
  versionId: number;
  label: string;
};

export type PrintDestination = "station" | "browser" | "download";

export type PrintConfirmSelection = {
  destination: PrintDestination;
  workstationId: number | null;
  templateVersionId: number | null;
};

export type PrintMethodHandlers = {
  /** Browser print dialog (PDF viewer + window.print / current print shell). */
  onBrowserPrint: (templateVersionId?: number | null) => void | Promise<void>;
  /**
   * Queue print to the chosen workstation.
   * `workstationId` is set when called from station destination.
   */
  onCloudPrint: (
    workstationId: number,
    templateVersionId?: number | null,
  ) => void | Promise<void>;
  /** Alias for onCloudPrint. */
  onAgentPrint?: (
    workstationId: number,
    templateVersionId?: number | null,
  ) => void | Promise<void>;
  /** Download PDF file. */
  onDownloadPdf: (templateVersionId?: number | null) => void | Promise<void>;
  /** Stage 5 Cleanup: remove after QZ retirement. */
  onQzPrint?: () => void | Promise<void>;
};

/** Options passed to requestPrint alongside handlers. */
export type PrintRequestMeta = {
  /** DTE kind_code for published templates (e.g. production_card, wz). */
  kindCode?: string | null;
  /** Prefs key (e.g. production_batch_card, wz, invoice). Defaults to kindCode. */
  documentTypeKey?: string | null;
  title?: string;
  description?: string;
};
