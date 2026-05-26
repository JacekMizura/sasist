/**
 * Opens PDFs in a minimal HTML shell so browser print can use @page rules on this document.
 * Native “open PDF only” tabs often default to shrink-to-fit A4; the wrapper + user hints reduce that.
 */

export type OpenPdfViewerOptions = {
  /** Open browser print dialog after delay (PDF plugin needs time to load). */
  autoPrint?: boolean;
  autoPrintDelayMs?: number;
  /** Revoke blob URLs created here (HTML shell, and PDF blob when applicable). */
  revokeBlobUrlsAfterMs?: number;
};

const DEFAULT_REVOKE_MS = 180_000;

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;");
}

/** Resolve relative paths (e.g. axios base `/api/...`) against the app origin for use in blob: HTML embed. */
export function toAbsoluteUrlForEmbed(urlOrPath: string): string {
  const s = String(urlOrPath ?? "").trim();
  if (!s) return s;
  try {
    return new URL(s, window.location.href).href;
  } catch {
    return s;
  }
}

function shellHtml(embedSrc: string, opts: OpenPdfViewerOptions): string {
  const safe = escapeHtmlAttribute(embedSrc);
  const delay = Math.max(0, Math.min(30_000, Math.floor(opts.autoPrintDelayMs ?? 900)));
  const autoPrintScript =
    opts.autoPrint
      ? `<script>window.addEventListener("load",function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},${delay});});<\/script>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PDF</title>
  ${autoPrintScript}
  <style>
    @page {
      size: auto;
      margin: 0;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      box-sizing: border-box;
    }
    *, *::before, *::after {
      box-sizing: inherit;
    }
    .pdf-print-hint {
      font: 12px/1.45 system-ui, -apple-system, Segoe UI, sans-serif;
      padding: 10px 12px;
      background: #fef9c3;
      color: #713f12;
      border-bottom: 1px solid #fde047;
    }
    .pdf-frame {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
    }
    body.has-hint .pdf-frame {
      top: 48px;
      height: calc(100% - 48px);
    }
    body:not(.has-hint) .pdf-frame {
      top: 0;
      height: 100%;
    }
    embed,
    object {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }
    @media print {
      .pdf-print-hint {
        display: none !important;
      }
      html, body {
        height: 100%;
        overflow: visible;
      }
      body.has-hint .pdf-frame,
      body:not(.has-hint) .pdf-frame {
        top: 0 !important;
        height: 100% !important;
      }
    }
  </style>
</head>
<body class="has-hint">
  <div class="pdf-print-hint" aria-live="polite">
    <strong>Print:</strong> set <strong>Scale</strong> to <strong>100%</strong> (Actual size) — turn off
    <strong>Fit to page</strong> / <strong>Shrink to fit</strong> — set <strong>margins to None</strong> if the
    browser offers it, so the PDF prints at the size defined by the file (e.g. label mm).
  </div>
  <div class="pdf-frame">
    <embed type="application/pdf" src="${safe}" />
  </div>
</body>
</html>`;
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

/**
 * Open a PDF blob in a new tab with @page margin 0 and an on-screen print hint (hidden when printing).
 */
export function openPdfBlobInPrintViewer(blob: Blob, options: OpenPdfViewerOptions = {}): Window | null {
  const pdf = blob.type?.includes("pdf") ? blob : new Blob([blob], { type: "application/pdf" });
  const pdfUrl = URL.createObjectURL(pdf);
  const html = shellHtml(pdfUrl, options);
  const htmlBlob = new Blob([html], { type: "text/html;charset=utf-8" });
  const htmlUrl = URL.createObjectURL(htmlBlob);
  const w = window.open(htmlUrl, "_blank", "noopener,noreferrer");
  const revokeMs = options.revokeBlobUrlsAfterMs ?? DEFAULT_REVOKE_MS;
  if (!w) {
    URL.revokeObjectURL(htmlUrl);
    URL.revokeObjectURL(pdfUrl);
    return null;
  }
  scheduleRevoke([htmlUrl, pdfUrl], revokeMs);
  return w;
}

/**
 * Open a PDF by absolute or same-origin-relative URL in a new tab (HTML shell + embed).
 */
export function openPdfUrlInPrintViewer(pdfUrl: string, options: OpenPdfViewerOptions = {}): Window | null {
  const abs = toAbsoluteUrlForEmbed(pdfUrl);
  const html = shellHtml(abs, options);
  const htmlBlob = new Blob([html], { type: "text/html;charset=utf-8" });
  const htmlUrl = URL.createObjectURL(htmlBlob);
  const w = window.open(htmlUrl, "_blank", "noopener,noreferrer");
  const revokeMs = options.revokeBlobUrlsAfterMs ?? DEFAULT_REVOKE_MS;
  if (!w) {
    URL.revokeObjectURL(htmlUrl);
    return null;
  }
  scheduleRevoke([htmlUrl], revokeMs);
  return w;
}
