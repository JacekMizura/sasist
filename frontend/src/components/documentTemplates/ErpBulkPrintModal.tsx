import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { PDFDocument } from "pdf-lib";

import { fetchPublishedTemplateOptions, type PublishedTemplateOptionDto } from "@/api/documentTemplatesApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import { DocumentTemplatePreviewThumbnail } from "./DocumentTemplatePreviewThumbnail";
import {
  fetchDocumentPrintPdfBlob,
  resolveOrderWzBulkPrintRequests,
  type DocumentPrintRequest,
} from "@/utils/documentTemplatePrint";
import { openPdfBlobInPrintViewer } from "@/utils/openPdfForBrowserPrint";

export type BulkDocumentTypeOption = {
  id: string;
  label: string;
  kindCode: string;
  buildRequests: (ids: Array<number | string>) => DocumentPrintRequest[];
  resolveRequests?: (ids: Array<number | string>) => Promise<DocumentPrintRequest[]>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  tenantId: number;
  title?: string;
  ids: Array<number | string>;
  documentTypes: BulkDocumentTypeOption[];
};

async function mergePdfBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 1) return blobs[0]!;
  const merged = await PDFDocument.create();
  for (const blob of blobs) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  return new Blob([await merged.save()], { type: "application/pdf" });
}

export function ErpBulkPrintModal({
  open,
  onClose,
  tenantId,
  title = "Masowy druk",
  ids,
  documentTypes,
}: Props) {
  const [step, setStep] = useState<"type" | "template">("type");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [options, setOptions] = useState<PublishedTemplateOptionDto[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resolvedRequests, setResolvedRequests] = useState<DocumentPrintRequest[]>([]);

  const selectedType = useMemo(
    () => documentTypes.find((t) => t.id === selectedTypeId) ?? null,
    [documentTypes, selectedTypeId],
  );

  const reset = useCallback(() => {
    setStep("type");
    setSelectedTypeId(null);
    setOptions([]);
    setResolvedRequests([]);
    setLoadingOptions(false);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const executePrint = useCallback(
    async (templateVersionId: number | null, reqs: DocumentPrintRequest[]) => {
      if (reqs.length === 0) return;
      setBusy(true);
      try {
        const blobs = await Promise.all(
          reqs.map((req) => fetchDocumentPrintPdfBlob(tenantId, req, templateVersionId)),
        );
        const merged = await mergePdfBlobs(blobs);
        openPdfBlobInPrintViewer(merged, { autoPrint: true });
        onClose();
      } catch (err) {
        toast.error(extractApiErrorMessage(err, "Nie udało się wygenerować PDF."));
      } finally {
        setBusy(false);
      }
    },
    [tenantId, onClose],
  );

  const loadTemplates = useCallback(
    async (kindCode: string, reqs: DocumentPrintRequest[]) => {
      setLoadingOptions(true);
      try {
        const items = await fetchPublishedTemplateOptions(tenantId, { kind_code: kindCode });
        setOptions(items);
        if (items.length <= 1) {
          await executePrint(items[0]?.version_id ?? null, reqs);
          return;
        }
        setStep("template");
      } catch (err) {
        toast.error(extractApiErrorMessage(err, "Nie udało się wczytać szablonów."));
        onClose();
      } finally {
        setLoadingOptions(false);
      }
    },
    [tenantId, executePrint, onClose],
  );

  const onPickDocumentType = (typeId: string) => {
    const hit = documentTypes.find((t) => t.id === typeId);
    if (!hit || ids.length === 0) return;
    setSelectedTypeId(typeId);
    void (async () => {
      try {
        const reqs = hit.resolveRequests ? await hit.resolveRequests(ids) : hit.buildRequests(ids);
        if (reqs.length === 0) {
          toast.error("Brak dokumentów do druku.");
          return;
        }
        setResolvedRequests(reqs);
        await loadTemplates(hit.kindCode, reqs);
      } catch (err) {
        toast.error(extractApiErrorMessage(err, "Nie udało się przygotować dokumentów do druku."));
      }
    })();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {ids.length} pozycji · {step === "type" ? "Wybierz rodzaj dokumentu" : "Wybierz szablon"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy || loadingOptions}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loadingOptions || busy ? (
          <div className="flex flex-col items-center gap-3 px-5 py-16 text-slate-600">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
            <p className="text-sm">{busy ? "Generowanie PDF…" : "Wczytywanie szablonów…"}</p>
          </div>
        ) : step === "type" ? (
          <div className="grid gap-2 p-5 sm:grid-cols-2">
            {documentTypes.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onPickDocumentType(opt.id)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-left text-sm font-semibold text-slate-800 hover:border-emerald-300 hover:bg-emerald-50"
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="grid max-h-[calc(90vh-5rem)] gap-4 overflow-y-auto p-5 sm:grid-cols-2">
            {options.map((opt) => (
              <article
                key={opt.version_id}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <DocumentTemplatePreviewThumbnail
                  tenantId={tenantId}
                  versionId={opt.version_id}
                  alt={opt.template_name}
                  className="h-40 w-full border-b border-slate-100 object-cover object-top"
                />
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">{opt.template_name}</h3>
                  {opt.description ? (
                    <p className="line-clamp-3 text-sm text-slate-600">{opt.description}</p>
                  ) : opt.kind_name ? (
                    <p className="text-sm text-slate-500">{opt.kind_name}</p>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void executePrint(opt.version_id, resolvedRequests)}
                    className="mt-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Drukuj ({ids.length})
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const ORDER_BULK_DOCUMENT_TYPES: BulkDocumentTypeOption[] = [
  {
    id: "confirmation",
    label: "Potwierdzenie zamówienia",
    kindCode: "order_confirmation",
    buildRequests: (ids) => ids.map((id) => ({ kind: "order_confirmation", orderId: Number(id) })),
  },
  {
    id: "picking_list",
    label: "Lista kompletacyjna",
    kindCode: "picking_list",
    buildRequests: (ids) => ids.map((id) => ({ kind: "picking_list", orderId: Number(id) })),
  },
  {
    id: "wz",
    label: "WZ",
    kindCode: "wz",
    buildRequests: () => [],
    resolveRequests: async (ids) =>
      resolveOrderWzBulkPrintRequests(ids.map((id) => Number(id)).filter((n) => Number.isFinite(n))),
  },
  {
    id: "return_document",
    label: "Zwrot",
    kindCode: "return_document",
    buildRequests: (ids) => ids.map((id) => ({ kind: "return_document", orderId: Number(id) })),
  },
];

export const PRODUCT_BULK_DOCUMENT_TYPES: BulkDocumentTypeOption[] = [
  {
    id: "product_card",
    label: "Karta produktu",
    kindCode: "product_card",
    buildRequests: (ids) => ids.map((id) => ({ kind: "product_card", productId: Number(id) })),
  },
];

export function stockBulkDocumentType(docType: string): BulkDocumentTypeOption {
  const kind = docType.toLowerCase();
  return {
    id: `stock_${kind}`,
    label: `Drukuj ${docType.toUpperCase()}`,
    kindCode: kind,
    buildRequests: (ids) =>
      ids.map((id) => ({ kind: "stock_document", documentId: Number(id), kindCode: kind })),
  };
}

export function saleBulkDocumentType(isReceipts: boolean): BulkDocumentTypeOption {
  const kindCode = isReceipts ? "receipt" : "invoice";
  return {
    id: kindCode,
    label: isReceipts ? "Paragon" : "Faktura",
    kindCode,
    buildRequests: (ids) =>
      ids.map((id) => ({ kind: "sale_document", documentId: String(id), kindCode })),
  };
}
