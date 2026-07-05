import { useCallback, useState } from "react";
import toast from "react-hot-toast";

import { DocumentTemplatePickerModal } from "@/components/documentTemplates/DocumentTemplatePickerModal";
import {
  printDocumentPdf,
  printWithTemplateResolution,
  type DocumentPrintRequest,
  type TemplatePickerState,
} from "@/utils/documentTemplatePrint";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";

type Options = {
  tenantId: number;
  autoPrint?: boolean;
};

export function useDocumentTemplatePrint({ tenantId, autoPrint = true }: Options) {
  const [picker, setPicker] = useState<TemplatePickerState | null>(null);
  const [busy, setBusy] = useState(false);

  const closePicker = useCallback(() => {
    if (busy) return;
    setPicker(null);
  }, [busy]);

  const requestPrint = useCallback(
    async (req: DocumentPrintRequest, opts?: { autoPrint?: boolean }) => {
      if (busy) return;
      setBusy(true);
      try {
        const outcome = await printWithTemplateResolution(
          tenantId,
          req,
          (state) => setPicker(state),
          { autoPrint: opts?.autoPrint ?? autoPrint },
        );
        if (outcome === "printed") setPicker(null);
      } catch (err) {
        toast.error(extractApiErrorMessage(err, "Nie udało się przygotować wydruku."));
      } finally {
        setBusy(false);
      }
    },
    [tenantId, autoPrint, busy],
  );

  const executePrint = useCallback(
    async (req: DocumentPrintRequest, templateVersionId?: number | null, opts?: { autoPrint?: boolean }) => {
      setBusy(true);
      try {
        await printDocumentPdf(tenantId, req, templateVersionId, { autoPrint: opts?.autoPrint ?? autoPrint });
        setPicker(null);
      } catch (err) {
        toast.error(extractApiErrorMessage(err, "Nie udało się wygenerować PDF."));
      } finally {
        setBusy(false);
      }
    },
    [tenantId, autoPrint],
  );

  const pickerModal = (
    <DocumentTemplatePickerModal
      open={picker != null}
      tenantId={tenantId}
      request={picker?.request ?? null}
      options={picker?.options ?? []}
      busy={busy}
      onClose={closePicker}
      onPrint={(versionId) => {
        if (!picker) return;
        void executePrint(picker.request, versionId);
      }}
    />
  );

  return { requestPrint, executePrint, pickerModal, printBusy: busy };
}
