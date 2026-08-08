import { fetchSaleDocumentPdfBlob } from "../../../api/saleDocumentsApi";
import type { WmsPackingPostPackStepApi } from "../../../api/wmsPackingApi";
import { downloadPdfBlob } from "../../printing/downloadPdfBlob";
import { getBackendPublicOrigin } from "../../../config/apiBase";
import { openPdfBlobInPrintViewer } from "../../../utils/openPdfForBrowserPrint";
import type { PackingPostDocumentAction } from "../../../types/wmsPackingExtendedUi";

export type WaybillPrintChoice = "one" | "all";

export type PackingPostFinishClientActionOpts = {
  tenantId: number;
  warehouseId: number;
  pipeline: WmsPackingPostPackStepApi[] | null | undefined;
  afterSalesDocumentAction: PackingPostDocumentAction;
  afterWaybillAction: PackingPostDocumentAction;
  /** auto_actions.print_document — wymuś akcję na dokumencie sprzedaży. */
  printDocumentEnabled: boolean;
  /** auto_actions.print_label — wymuś akcję na liście przewozowym. */
  printLabelEnabled: boolean;
  /** Drukuj kopię tego samego dokumentu sprzedaży (bez nowej numeracji). */
  printCopyOfSalesDoc?: boolean;
  /** Gdy >1 list — zapytaj operatora ile drukować. */
  chooseWaybillPrintCount?: boolean;
  /** Zwraca wybór operatora; domyślnie „all” gdy brak callbacka. */
  requestWaybillPrintChoice?: (waybillCount: number) => Promise<WaybillPrintChoice>;
};

function parseStepMessage(message: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!message) return out;
  for (const part of message.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) {
      if (part.trim()) out.kind = part.trim();
      continue;
    }
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  if (!out.kind) {
    const first = message.split(";")[0]?.trim();
    if (first && !first.includes("=")) out.kind = first;
  }
  return out;
}

function findStep(pipeline: WmsPackingPostPackStepApi[] | null | undefined, name: string) {
  return pipeline?.find((s) => s.step === name);
}

function resolvePublicFileUrl(fileUrl: string): string {
  const p = (fileUrl || "").trim();
  if (!p) return "";
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  const origin = getBackendPublicOrigin().replace(/\/$/, "");
  if (!origin) return p;
  return `${origin}${p.startsWith("/") ? p : `/${p}`}`;
}

async function fetchBlobFromUrl(fileUrl: string): Promise<Blob | null> {
  const url = resolvePublicFileUrl(fileUrl);
  if (!url) return null;
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    return blob;
  } catch {
    return null;
  }
}

async function deliverPdf(
  blob: Blob,
  action: PackingPostDocumentAction,
  fileName: string,
): Promise<void> {
  if (action === "download") {
    downloadPdfBlob(blob, fileName);
    return;
  }
  openPdfBlobInPrintViewer(blob, { autoPrint: true, revokeBlobUrlsAfterMs: 120_000 });
}

async function deliverSalesDoc(
  tenantId: number,
  meta: Record<string, string>,
  action: PackingPostDocumentAction,
  opts?: { printCopy?: boolean },
): Promise<void> {
  const saleId = (meta.sale_document_id || "").trim();
  const printOnce = async (blob: Blob, name: string) => {
    await deliverPdf(blob, action, name);
    if (opts?.printCopy && action === "print") {
      // Kopia tego samego PDF — bez nowego dokumentu / numeracji.
      await deliverPdf(blob, "print", name.replace(/\.pdf$/i, "-kopia.pdf"));
    }
  };
  if (saleId) {
    try {
      const blob = await fetchSaleDocumentPdfBlob(tenantId, saleId);
      await printOnce(blob, `dokument-sprzedazy-${saleId}.pdf`);
    } catch {
      /* brak / błąd PDF — nie przerywaj potoku */
    }
    return;
  }
  const fileUrl = (meta.file_url || meta.sales_file_url || "").trim();
  if (!fileUrl) return;
  const blob = await fetchBlobFromUrl(fileUrl);
  if (!blob) return;
  await printOnce(blob, `dokument-sprzedazy.pdf`);
}

async function deliverWaybill(
  fileUrl: string,
  action: PackingPostDocumentAction,
  index: number,
): Promise<void> {
  const blob = await fetchBlobFromUrl(fileUrl);
  if (!blob) return;
  await deliverPdf(blob, action, `list-przewozowy-${index + 1}.pdf`);
}

function stepHasWaybillFile(step: WmsPackingPostPackStepApi | undefined): boolean {
  if (!step || !step.ok || step.skipped === true) return false;
  const meta = parseStepMessage(step.message);
  return Boolean((meta.file_url || "").trim());
}

function collectWaybillUrls(meta: Record<string, string>): string[] {
  const multi = (meta.file_urls || "").trim();
  if (multi) {
    return multi
      .split("|")
      .map((u) => u.trim())
      .filter(Boolean);
  }
  const one = (meta.file_url || "").trim();
  return one ? [one] : [];
}

/**
 * Client-side print/download after packing finish pipeline.
 * Soft-fails missing documents — never throws.
 */
export async function runPackingPostFinishClientActions(opts: PackingPostFinishClientActionOpts): Promise<void> {
  const {
    tenantId,
    pipeline,
    afterSalesDocumentAction,
    afterWaybillAction,
    printDocumentEnabled,
    printLabelEnabled,
    printCopyOfSalesDoc = false,
    chooseWaybillPrintCount = false,
    requestWaybillPrintChoice,
  } = opts;

  const salesAction: PackingPostDocumentAction =
    afterSalesDocumentAction === "download" ? "download" : "print";
  const waybillAction: PackingPostDocumentAction =
    afterWaybillAction === "download" ? "download" : "print";

  try {
    let salesHandled = false;

    const createStep = findStep(pipeline, "create_document");
    if (createStep?.ok && createStep.skipped !== true) {
      const meta = parseStepMessage(createStep.message);
      const idMatch = /^id=([^;]+)/.exec((createStep.message || "").trim());
      if (idMatch?.[1]) meta.sale_document_id = idMatch[1];
      if (meta.sale_document_id || meta.file_url) {
        await deliverSalesDoc(tenantId, meta, salesAction, { printCopy: printCopyOfSalesDoc });
        salesHandled = true;
      }
    }

    const printDocStep = findStep(pipeline, "print_document");
    if (
      !salesHandled &&
      printDocumentEnabled &&
      printDocStep?.ok &&
      printDocStep.skipped !== true
    ) {
      await deliverSalesDoc(tenantId, parseStepMessage(printDocStep.message), salesAction, {
        printCopy: printCopyOfSalesDoc,
      });
      salesHandled = true;
    }

    const printLabel = findStep(pipeline, "print_label");
    const genShip = findStep(pipeline, "generate_shipment");
    const waybillStep =
      printLabelEnabled && stepHasWaybillFile(printLabel)
        ? printLabel
        : stepHasWaybillFile(genShip)
          ? genShip
          : printLabelEnabled && printLabel?.ok && printLabel.skipped !== true
            ? printLabel
            : null;

    if (waybillStep) {
      const meta = parseStepMessage(waybillStep.message);
      let urls = collectWaybillUrls(meta);
      if (urls.length > 1 && chooseWaybillPrintCount) {
        const choice = requestWaybillPrintChoice
          ? await requestWaybillPrintChoice(urls.length)
          : "all";
        if (choice === "one") {
          // Istniejący mechanizm „jeden list” — najnowszy (pierwszy w kolejności desc).
          urls = urls.slice(0, 1);
        }
      }
      for (let i = 0; i < urls.length; i++) {
        await deliverWaybill(urls[i]!, waybillAction, i);
      }
      if (waybillAction === "print" && urls.length > 0) {
        const companion: Record<string, string> = {};
        if (meta.sales_file_url) companion.file_url = meta.sales_file_url;
        if (meta.sales_order_document_id) companion.order_document_id = meta.sales_order_document_id;
        if (companion.file_url) {
          await deliverSalesDoc(tenantId, companion, "print");
        }
      }
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("packing post-finish client actions soft-failed", err);
    }
  }
}
