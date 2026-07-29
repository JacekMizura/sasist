import { useCallback, useEffect, useState } from "react";

import {
  fetchTemplateUsage,
  type TemplateUsageReport,
} from "../../../../api/documentTemplatesApi";
import { DEFAULT_TENANT_ID } from "../constants";
import { TemplateAssignmentModal } from "./TemplateAssignmentModal";
import { TemplateUsageReportBody } from "./TemplateUsageReportBody";
import { brandPrimaryButtonClass } from "../../../../design-system/brandUi";

type Props = {
  templateId: number;
  templateKindCode: string | null;
  templateKindName: string | null;
  publishedVersionId: number | null;
  onAssignmentsChange?: () => void;
};

export function TemplateUsagePanel({
  templateId,
  templateKindCode,
  templateKindName,
  publishedVersionId,
  onAssignmentsChange,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<TemplateUsageReport | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTemplateUsage(DEFAULT_TENANT_ID, templateId);
      setReport(data);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Raport użycia</h3>
          <p className="mt-1 text-xs text-slate-500">
            Gdzie dokładnie ten szablon jest skonfigurowany — firmy, magazyny, stanowiska, serie i reguły.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
          onClick={() => setModalOpen(true)}
        >
          Przypisz
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie raportu…</p>
      ) : report ? (
        <>
          <TemplateUsageReportBody report={report} />
          {(report.summary?.total ?? report.total) === 0 ? (
            <button type="button" className={brandPrimaryButtonClass} onClick={() => setModalOpen(true)}>
              Przypisz do dokumentów
            </button>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-slate-500">Nie udało się wczytać użyć.</p>
      )}

      <TemplateAssignmentModal
        templateId={templateId}
        templateKindCode={templateKindCode}
        templateKindName={templateKindName}
        publishedVersionId={publishedVersionId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void load();
          onAssignmentsChange?.();
        }}
      />
    </div>
  );
}
