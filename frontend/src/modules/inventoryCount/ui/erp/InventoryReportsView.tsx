import { CheckCircle2, FileSpreadsheet, FileText, Loader2 } from "lucide-react";

import type { InventoryDocumentRead } from "@/api/inventoryCountApi";
import { inventoryReportDescription } from "../../inventoryCountUiLabels";
import { inventoryDocOptionLabel } from "./InventoryDocListRow";
import InventoryDocumentPicker from "./InventoryDocumentPicker";
import InventoryStatusBadge from "./InventoryStatusBadge";
import {
  erpFieldLabel,
  erpPageShell,
  erpSurfaceCard,
  erpTable,
  erpTableScroll,
  erpTableWrap,
  erpTbody,
  erpTd,
  erpTh,
  erpThead,
  erpTr,
} from "./theme";

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

/** Reports — document picker card + export table (presentation only). */
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
    <div className={erpPageShell}>
      <div
        className={`${erpSurfaceCard} mb-6 flex flex-col items-start justify-between gap-6 p-6 md:flex-row md:items-center`}
      >
        <div className="w-full max-w-md flex-1">
          <label htmlFor="inventory-report-doc" className={erpFieldLabel}>
            Dokument
          </label>
          <InventoryDocumentPicker
            id="inventory-report-doc"
            options={pickerOptions}
            value={selectedDocumentId}
            onChange={onSelectDocument}
            className="w-full"
            triggerClassName="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-left text-sm text-slate-900 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
          />
        </div>

        {!selectedDocumentId ? (
          <div className="w-full px-4 py-3 text-sm text-slate-500 md:w-auto">
            Wybierz dokument powyżej, aby wygenerować i pobrać raporty.
          </div>
        ) : (
          <div className="flex w-full items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 md:w-auto">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            <p>
              Dokument <span className="font-semibold">{selectedDoc?.number ?? selectedDocumentId}</span> załadowany.
            </p>
          </div>
        )}
      </div>

      <div className={erpTableWrap}>
        <div className={erpTableScroll}>
          <table className={erpTable}>
            <thead className={erpThead}>
              <tr>
                <th className={erpTh}>Raport</th>
                <th className={erpTh}>Opis</th>
                <th className={erpTh}>Status</th>
                <th className={`${erpTh} text-right`}>Eksport</th>
              </tr>
            </thead>
            <tbody className={erpTbody}>
              {reports.map((report) => (
                <tr key={report.kind} className={`${erpTr} group`}>
                  <td className={`${erpTd} font-medium text-slate-900`}>{report.label}</td>
                  <td className={`${erpTd} text-slate-500`}>{inventoryReportDescription(report.kind)}</td>
                  <td className={erpTd}>
                    <InventoryStatusBadge status={report.status} variant="report" />
                  </td>
                  <td className={`${erpTd} text-right`}>
                    <div className="flex items-center justify-end gap-3">
                      {report.formats.includes("pdf") ? (
                        <button
                          type="button"
                          disabled={!selectedDocumentId || downloadBusy != null}
                          onClick={() => onDownload(report.kind, "pdf")}
                          className={`inline-flex items-center gap-1.5 text-xs font-medium transition-all ${
                            selectedDocumentId
                              ? "cursor-pointer text-red-500 hover:text-red-700"
                              : "cursor-not-allowed text-slate-300"
                          }`}
                        >
                          {downloadBusy === `${report.kind}-pdf` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FileText className="h-3.5 w-3.5" />
                          )}
                          PDF
                        </button>
                      ) : null}
                      {report.formats.includes("xlsx") ? (
                        <button
                          type="button"
                          disabled={!selectedDocumentId || downloadBusy != null}
                          onClick={() => onDownload(report.kind, "xlsx")}
                          className={`inline-flex items-center gap-1.5 text-xs font-medium transition-all ${
                            selectedDocumentId
                              ? "cursor-pointer text-emerald-600 hover:text-emerald-800"
                              : "cursor-not-allowed text-slate-300"
                          }`}
                        >
                          {downloadBusy === `${report.kind}-xlsx` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                          )}
                          XLSX
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
