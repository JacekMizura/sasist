import { Loader2, X } from "lucide-react";

import type { PublishedTemplateOptionDto } from "@/api/documentTemplatesApi";
import type { DocumentPrintRequest } from "@/utils/documentTemplatePrint";
import { DocumentTemplatePreviewThumbnail } from "./DocumentTemplatePreviewThumbnail";

type Props = {
  open: boolean;
  tenantId: number;
  request: DocumentPrintRequest | null;
  options: PublishedTemplateOptionDto[];
  busy?: boolean;
  onClose: () => void;
  onPrint: (versionId: number) => void;
};

export function DocumentTemplatePickerModal({
  open,
  tenantId,
  request,
  options,
  busy = false,
  onClose,
  onPrint,
}: Props) {
  if (!open || !request) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Wybierz szablon</h2>
            <p className="mt-0.5 text-sm text-slate-500">Wybierz wariant dokumentu do wydruku.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

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
                  onClick={() => onPrint(opt.version_id)}
                  className="mt-auto inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      Drukowanie…
                    </>
                  ) : (
                    "Drukuj"
                  )}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
