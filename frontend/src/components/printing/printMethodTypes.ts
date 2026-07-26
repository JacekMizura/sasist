/** Shared print method for Sasist Cloud Print / browser / PDF download. */
export type PrintMethod = "browser" | "cloud" | "download";

export type PrintMethodKind = "a4" | "label" | "receipt";

export type PrintMethodHandlers = {
  /** Browser print dialog (PDF viewer + window.print / current print shell). */
  onBrowserPrint: () => void | Promise<void>;
  /** Sasist Cloud Print queue (default or selected agent printer). */
  onCloudPrint: () => void | Promise<void>;
  /** Download PDF file. */
  onDownloadPdf: () => void | Promise<void>;
};
