import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { PDFDocument } from "pdf-lib";

import { fetchPublishedTemplateOptions, type PublishedTemplateOptionDto } from "@/api/documentTemplatesApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import { listSellasistInputClass } from "@/components/listPage/listSellasistTokens";
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
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resolvedRequests, setResolvedRequests] = useState<DocumentPrintRequest[]>([]);

  const selectedType = useMemo(
    () => documentTypes.find((t) => t.id === selectedTypeId) ?? null,
    [documentTypes, selectedTypeId],
  );

  const reset = useCallback(() => {
    setStep(documentTypes.length === 1 ? "template" : "type");
    setSelectedTypeId(documentTypes.length === 1 ? documentTypes[0]!.id : null);
    setOptions([]);
    setSelectedVersionId(null);
    setResolvedRequests([]);
    setLoadingOptions(false);
    setBusy(false);
  }, [documentTypes]);

  useEffect(() => {
    if (!open) return;
    reset();
  }, [open, reset]);

  const executePrint = useCallback(
    async (templateVersionId: number | null, reqs: DocumentPrintRequest[]) => {
      if (reqs.length === 0 || !templateVersionId) return;
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
    async (type: BulkDocumentTypeOption, reqs: DocumentPrintRequest[]) => {
      setLoadingOptions(true);
      try {
        const items = await fetchPublishedTemplateOptions(tenantId, { kind_code: type.kindCode });
        if (items.length === 0) {
          toast.error("Brak opublikowanych szablonów przypisanych do tego typu dokumentu.");
          return;
        }
        const defaultItem = items.find((i) => i.is_default_binding) ?? items[0]!;
        setOptions(items);
        setSelectedVersionId(defaultItem.version_id);
        setSelectedTypeId(type.id);
        setResolvedRequests(reqs);
        setStep("template");
      } catch (err) {
        toast.error(extractApiErrorMessage(err, "Nie udało się wczytać szablonów."));
      } finally {
        setLoadingOptions(false);
      }
    },
    [tenantId],
  );

  useEffect(() => {
    if (!open || documentTypes.length !== 1 || selectedTypeId) return;
    const only = documentTypes[0]!;
    if (ids.length === 0) return;
    void (async () => {
      try {
        const reqs = only.resolveRequests ? await only.resolveRequests(ids) : only.buildRequests(ids);
        if (reqs.length === 0) {
          toast.error("Brak dokumentów do druku.");
          return;
        }
        await loadTemplates(only, reqs);
      } catch (err) {
        toast.error(extractApiErrorMessage(err, "Nie udało się przygotować dokumentów do druku."));
      }
    })();
  }, [open, documentTypes, ids, loadTemplates, selectedTypeId]);

  const onPickDocumentType = (typeId: string) => {
    const hit = documentTypes.find((t) => t.id === typeId);
    if (!hit || ids.length === 0) return;
    void (async () => {
      try {
        const reqs = hit.resolveRequests ? await hit.resolveRequests(ids) : hit.buildRequests(ids);
        if (reqs.length === 0) {
          toast.error("Brak dokumentów do druku.");
          return;
        }
        await loadTemplates(hit, reqs);
      } catch (err) {
        toast.error(extractApiErrorMessage(err, "Nie udało się przygotować dokumentów do druku."));
      }
    })();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{ids.length} pozycji</p>
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
          <div className="grid gap-2 p-5">
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
          <div className="space-y-5 p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rodzaj dokumentu</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {selectedType?.label ?? options[0]?.kind_name ?? "—"}
              </div>
            </div>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Szablon</span>
              <div className="relative mt-1">
                <select
                  className={`${listSellasistInputClass} appearance-none pr-10`}
                  value={selectedVersionId ?? ""}
                  onChange={(e) => setSelectedVersionId(Number(e.target.value))}
                >
                  {options.map((opt) => (
                    <option key={opt.version_id} value={opt.version_id}>
                      {opt.template_name}
                      {opt.is_default_binding ? " (domyślny)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              </div>
            </label>
            <button
              type="button"
              disabled={busy || !selectedVersionId}
              onClick={() => void executePrint(selectedVersionId, resolvedRequests)}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Drukuj ({ids.length})
            </button>
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
