import { openPdfBlobInPrintViewer } from "../src/utils/openPdfForBrowserPrint.ts";

const opens: Array<{ url: string; target?: string; features?: string }> = [];

// Minimal browser globals for Node/tsx
(globalThis as any).window = globalThis;
(globalThis as any).window.open = (url?: string | URL, target?: string, features?: string) => {
  opens.push({ url: String(url ?? ""), target, features });
  return { focus() {}, print() {}, closed: false };
};

const blob = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], {
  type: "application/pdf",
});
const w = openPdfBlobInPrintViewer(blob, { autoPrint: true, autoPrintDelayMs: 10 });
if (!w) throw new Error("null window");
if (opens.length !== 1) throw new Error(`opens=${opens.length}`);
const call = opens[0]!;
if (!call.url.startsWith("blob:")) throw new Error(call.url);
if (call.features && /noopener|noreferrer/i.test(call.features)) {
  throw new Error(`features=${call.features}`);
}
const ab = await (await fetch(call.url)).arrayBuffer();
const head = Buffer.from(ab).subarray(0, 5).toString("ascii");
if (head !== "%PDF-") throw new Error(`head=${head}`);
console.log(
  JSON.stringify({
    ok: true,
    head,
    size: ab.byteLength,
    features: call.features ?? null,
    autoPrintScheduled: true,
  }),
);
