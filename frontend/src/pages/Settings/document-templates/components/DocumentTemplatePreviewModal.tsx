import { useEffect, useMemo, useState } from "react";

import {
  fetchDocumentTemplate,
  fetchVersionContent,
  previewDocumentPdf,
} from "../../../../api/documentTemplatesApi";
import { extractApiErrorMessage } from "../../../../api/apiErrorMessage";
import { TemplatePreviewShellModal } from "../../../../components/templates/TemplatePreviewShellModal";
import { DEFAULT_TENANT_ID } from "../constants";

type Props = {
  templateId: number;
  templateName: string;
  formatLabel: string;
  onClose: () => void;
};

/**
 * List „Podgląd” for print templates — same shell as labels, engine PDF render.
 */
export function DocumentTemplatePreviewModal({
  templateId,
  templateName,
  formatLabel,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setPdfBlob(null);
      try {
        const detail = await fetchDocumentTemplate(DEFAULT_TENANT_ID, templateId);
        const kindCode = detail.kind?.code;
        if (!kindCode) {
          throw new Error("Szablon nie ma przypisanego typu dokumentu.");
        }

        const versionMeta = detail.published_version ?? detail.draft_version;
        if (!versionMeta) {
          throw new Error("Brak wersji do podglądu.");
        }

        const version =
          versionMeta.twig_content != null && versionMeta.twig_content !== ""
            ? versionMeta
            : await fetchVersionContent(versionMeta.id);

        const twig = String(version.twig_content ?? "");
        if (!twig.trim()) {
          throw new Error("Wersja szablonu jest pusta.");
        }

        const pdf = await previewDocumentPdf(DEFAULT_TENANT_ID, {
          kind_code: kindCode,
          twig_content: twig,
          context_mode: "sample",
          version_id: version.id,
          extends_version_id: version.extends_version_id ?? null,
          partial_pins_json: version.partial_pins_json ?? null,
          warehouse_id: 1,
          params: {},
        });
        if (!cancelled) setPdfBlob(pdf);
      } catch (err) {
        if (!cancelled) {
          setError(extractApiErrorMessage(err, "Nie udało się wygenerować podglądu."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const pdfUrl = useMemo(() => (pdfBlob ? URL.createObjectURL(pdfBlob) : null), [pdfBlob]);
  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  return (
    <TemplatePreviewShellModal
      title={templateName}
      subtitle={formatLabel}
      onClose={onClose}
      maxWidthClassName="max-w-4xl"
    >
      <div className="w-full overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-16 text-center text-sm text-slate-500">Generowanie podglądu…</p>
        ) : error ? (
          <p className="px-4 py-16 text-center text-sm text-rose-700">{error}</p>
        ) : pdfUrl ? (
          <iframe
            title={`Podgląd ${templateName}`}
            className="h-[min(780px,72vh)] w-full border-0 bg-white"
            src={`${pdfUrl}#view=FitH&zoom=page-width`}
          />
        ) : (
          <p className="px-4 py-16 text-center text-sm text-slate-500">Brak podglądu.</p>
        )}
      </div>
    </TemplatePreviewShellModal>
  );
}
