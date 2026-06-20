import { CheckCircle2, FileSpreadsheet, FileText, Loader2 } from "lucide-react";

import type { InventoryDocumentRead } from "@/api/inventoryCountApi";
import { filterInputClass, filterLabelClass, filterToolbarBtnSecondary } from "@/components/filters/filterUiTokens";
import { inventoryReportDescription } from "../../inventoryCountUiLabels";
import { inventoryDocOptionLabel } from "./InventoryDocListRow";
import InventoryDocumentPicker from "./InventoryDocumentPicker";
import InventoryStatusBadge from "./InventoryStatusBadge";

export type ReportRow = {
  kind: string;
  label: string;
  formats: string[];
  status: string;
};

type Props = {
  reports: ReportRow[];
  documents: InventoryDocumentRead[];
  selectedDocumentId: number | "";
  onSelectDocument: (id: number | "") => void;
  onDownload: (kind: string, format: "pdf" | "xlsx") => void;
  downloadBusy: string | null;
};

/** Reports — karty raportów + wybór dokumentu. */
export default function InventoryReportsView({
  reports,
  documents,
  selectedDocumentId,
  onSelectDocument,
  onDownload,
  downloadBusy,
}: Props) {
  const pickerOptions = [
    { value: "" as const, label: "— wybierz dokument —" },
    ...documents.map((doc) => ({
      value: doc.id,
      label: inventoryDocOptionLabel(doc),
    })),
  ];

  const selectedDoc = documents.find((d) => d.id === selectedDocumentId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Raporty inwentaryzacji</h2>
        <p className="mt-1 text-sm text-slate-500">Eksport protokołów, różnic i aktywności operatorów.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="inventory-report-doc" className={filterLabelClass}>
          Dokument źródłowy
        </label>
        <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end">
          <InventoryDocumentPicker
            id="inventory-report-doc"
            options={pickerOptions}
            value={selectedDocumentId}
            onChange={onSelectDocument}
            className="min-w-0 flex-1"
            triggerClassName={`${filterInputClass} flex w-full cursor-pointer items-center justify-between text-left`}
          />
          {!selectedDocumentId ? (
            <p className="text-sm text-slate-500 md:max-w-xs">Wybierz dokument, aby odblokować eksport.</p>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              <span>
                Załadowano: <span className="font-semibold">{selectedDoc?.number ?? selectedDocumentId}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {reports.map((report) => (
          <article
            key={report.kind}
            className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-base font-semibold text-slate-900">{report.label}</h3>
                <InventoryStatusBadge status={report.status} variant="report" />
              </div>
              <p className="mt-1 text-sm text-slate-500">{inventoryReportDescription(report.kind)}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {report.formats.includes("pdf") ? (
                <button
                  type="button"
                  disabled={!selectedDocumentId || downloadBusy != null}
                  onClick={() => onDownload(report.kind, "pdf")}
                  className={`${filterToolbarBtnSecondary} inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {downloadBusy === `${report.kind}-pdf` ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <FileText className="h-4 w-4 text-red-500" aria-hidden />
                  )}
                  PDF
                </button>
              ) : null}
              {report.formats.includes("xlsx") ? (
                <button
                  type="button"
                  disabled={!selectedDocumentId || downloadBusy != null}
                  onClick={() => onDownload(report.kind, "xlsx")}
                  className={`${filterToolbarBtnSecondary} inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {downloadBusy === `${report.kind}-xlsx` ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" aria-hidden />
                  )}
                  XLSX
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
