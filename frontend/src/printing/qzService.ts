/**
 * QZ Tray integration for direct label printing.
 * Requires QZ Tray to be installed and the qz-tray.js script loaded (or window.qz set).
 * Script: https://raw.githubusercontent.com/qzind/tray/master/js/qz-tray.js
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
 */
export async function connectQZ(): Promise<void> {
  const qz = getApi();
  await qz.websocket.connect();
}

/**
 * List system printer names (for mapping to Printer records).
 */
export async function listSystemPrinters(): Promise<string[]> {
  const qz = getApi();
  return await qz.printers.find();
}

/**
 * Send a PDF (base64) to a system printer by name.
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
 */
export function isQzAvailable(): boolean {
  return typeof getQz().qz !== "undefined";
}
