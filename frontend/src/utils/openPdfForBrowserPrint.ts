/**
 * Opens a PDF in a new browser tab using the native PDF viewer.
 *
 * Important: do NOT wrap the PDF in an HTML shell with <embed src="blob:…">
 * and window.open(..., "noopener") — the child tab cannot read the opener's
 * blob URL, so the page appears empty while download of the same blob works.
 */

export type OpenPdfViewerOptions = {
  /** Open browser print dialog after delay (PDF viewer needs time to load). */
  autoPrint?: boolean;
  autoPrintDelayMs?: number;
  /** Revoke blob URLs created here. */
  revokeBlobUrlsAfterMs?: number;
};

const DEFAULT_REVOKE_MS = 180_000;

/** Resolve relative paths (e.g. axios base `/api/...`) against the app origin. */
export function toAbsoluteUrlForEmbed(urlOrPath: string): string {
  const s = String(urlOrPath ?? "").trim();
  if (!s) return s;
  try {
    return new URL(s, window.location.href).href;
  } catch {
    return s;
  }
}

function scheduleRevoke(urls: string[], ms: number): void {
  window.setTimeout(() => {
    for (const u of urls) {
      try {
        URL.revokeObjectURL(u);
      } catch {
        /* ignore */
      }
    }
  }, ms);
}

function scheduleAutoPrint(w: Window, options: OpenPdfViewerOptions): void {
  if (!options.autoPrint) return;
  const delay = Math.max(0, Math.min(30_000, Math.floor(options.autoPrintDelayMs ?? 900)));
  window.setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      /* PDF plugin may not expose print() — user can Ctrl+P */
    }
  }, delay);
}

/**
 * Open a PDF blob in a new tab (native PDF viewer — same bytes as download).
 * Keeps opener relationship (no noopener) so the blob: URL stays readable.
 */
export function openPdfBlobInPrintViewer(blob: Blob, options: OpenPdfViewerOptions = {}): Window | null {
  const pdf = blob.type?.includes("pdf") ? blob : new Blob([blob], { type: "application/pdf" });
  const pdfUrl = URL.createObjectURL(pdf);
  // Do not pass noopener/noreferrer — blob URLs are scoped to the creating document.
  const w = window.open(pdfUrl, "_blank");
  const revokeMs = options.revokeBlobUrlsAfterMs ?? DEFAULT_REVOKE_MS;
  if (!w) {
    URL.revokeObjectURL(pdfUrl);
    return null;
  }
  scheduleAutoPrint(w, options);
  scheduleRevoke([pdfUrl], revokeMs);
  return w;
}

/**
 * Open a PDF by absolute or same-origin-relative URL in a new tab (native viewer).
 */
export function openPdfUrlInPrintViewer(pdfUrl: string, options: OpenPdfViewerOptions = {}): Window | null {
  const abs = toAbsoluteUrlForEmbed(pdfUrl);
  const w = window.open(abs, "_blank");
  if (!w) return null;
  scheduleAutoPrint(w, options);
  return w;
}
