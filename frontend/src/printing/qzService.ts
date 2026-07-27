/**
 * QZ Tray integration for direct label printing.
 * Requires QZ Tray to be installed and the qz-tray.js script loaded (or window.qz set).
 * Script: https://raw.githubusercontent.com/qzind/tray/master/js/qz-tray.js
 *
 * Stage 5 Cleanup: delete this module after Sasist Agent cutover is complete.
 * Callers must go through PrintingRouter — do not import qzService from feature pages.
 */

const getQz = (): typeof window & { qz?: QZApi } => window as typeof window & { qz?: QZApi };

export interface QZApi {
  websocket: { connect: (opts?: { retries?: number; delay?: number }) => Promise<void>; disconnect: () => Promise<void> };
  printers: { find: () => Promise<string[]> };
  configs: { create: (printerName: string) => unknown };
  print: (config: unknown, data: Array<{ type: string; format: string; data: string }>) => Promise<void>;
  security: {
    setCertificatePromise: (fn: () => Promise<string>) => void;
    setSignaturePromise: (fn: (toSign: string) => Promise<string>) => void;
  };
}

function getApi(): QZApi {
  const qz = getQz().qz;
  if (!qz) throw new Error("QZ Tray is not loaded. Install QZ Tray and add the qz-tray.js script.");
  return qz;
}

/**
 * Configure QZ security (signature from backend; certificate optional).
 * Call once before connectQZ().
 *
 * TODO(sasist-agent-migration): Delete with QZ — agent auth uses spt_/sat_ tokens, not /qz/sign.
 */
export function setQzSecurity(
  signEndpoint: (toSign: string) => Promise<string>,
  certificatePromise?: () => Promise<string>
): void {
  const qz = getQz().qz;
  if (!qz?.security) return;
  qz.security.setSignaturePromise((toSign: string) => signEndpoint(toSign));
  if (certificatePromise) qz.security.setCertificatePromise(certificatePromise);
}

/**
 * Connect to QZ Tray via WebSocket.
 *
 * TODO(sasist-agent-migration): Agent uses HTTPS poll (and later WSS /api/agent/v1/ws) — not QZ WS.
 */
export async function connectQZ(): Promise<void> {
  const qz = getApi();
  await qz.websocket.connect();
}

/**
 * List system printer names (for mapping to Printer records).
 *
 * TODO(sasist-agent-migration): Use GET /printing/printers (agent_printers) instead of QZ find().
 */
export async function listSystemPrinters(): Promise<string[]> {
  const qz = getApi();
  return await qz.printers.find();
}

/**
 * Send a PDF (base64) to a system printer by name.
 *
 * TODO(sasist-agent-migration): Queue PDF via Sasist Agent (`format=pdf`) — no browser→QZ hop.
 * For Zebra labels prefer ZPL (`format=zpl`) when template can emit ZPL.
 */
export async function printPdf(printerName: string, pdfBase64: string): Promise<void> {
  const qz = getApi();
  const config = qz.configs.create(printerName);
  const data = [
    {
      type: "pdf",
      format: "base64",
      data: pdfBase64,
    },
  ];
  await qz.print(config, data);
}

/**
 * Check if QZ Tray API is available (script loaded).
 *
 * TODO(sasist-agent-migration): Replace with cloud-capability / prefer_sasist_agent + online agent check.
 */
export function isQzAvailable(): boolean {
  return typeof getQz().qz !== "undefined";
}
