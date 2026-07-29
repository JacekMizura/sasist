/**
 * Smoke check: openPdfBlobInPrintViewer must open the PDF blob URL directly
 * (no HTML wrapper, no noopener).
 */
import { openPdfBlobInPrintViewer } from "../src/utils/openPdfForBrowserPrint";

const opens: Array<{ url: string; target?: string; features?: string }> = [];
const originalOpen = window.open.bind(window);
// @ts-expect-error test stub
window.open = (url?: string | URL, target?: string, features?: string) => {
  opens.push({ url: String(url ?? ""), target, features });
  return { focus() {}, print() {}, closed: false } as Window;
};

const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const blob = new Blob([pdfBytes], { type: "application/pdf" });
const w = openPdfBlobInPrintViewer(blob, { autoPrint: false, revokeBlobUrlsAfterMs: 60_000 });

if (!w) throw new Error("window.open returned null");
if (opens.length !== 1) throw new Error(`expected 1 open, got ${opens.length}`);
const call = opens[0]!;
if (!call.url.startsWith("blob:")) throw new Error(`expected blob URL, got ${call.url}`);
if (call.features && /noopener|noreferrer/i.test(call.features)) {
  throw new Error(`must not use noopener/noreferrer, got features=${call.features}`);
}
// Fetch the opened blob and ensure it is PDF bytes, not HTML
const res = await fetch(call.url);
const buf = new Uint8Array(await res.arrayBuffer());
const head = String.fromCharCode(...buf.slice(0, 5));
if (head !== "%PDF-") throw new Error(`opened blob is not PDF, head=${head}`);
const ct = res.headers.get("content-type") || blob.type;
console.log("OK browser-print opens native PDF blob", { url: call.url.slice(0, 48), head, size: buf.length, ct });

window.open = originalOpen;
