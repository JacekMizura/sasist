import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";

import type { InventoryDocumentRead } from "@/api/inventoryCountApi";
import { FilterField } from "@/components/filters";
import {
  moduleListDataCardClass,
  moduleListPageShellClass,
  moduleListTableInteriorClass,
} from "@/components/listPage/moduleListLayoutTokens";
import {
  panelListDenseRowClass,
  panelListDenseTableClass,
  panelListDenseTableScrollWrapClass,
  panelListDenseTdBase,
  panelListDenseThBase,
  panelListDenseTheadClass,
} from "@/components/operational";
import { inventoryReportDescription } from "../../inventoryCountUiLabels";
import { inventoryDocOptionLabel } from "./InventoryDocListRow";
import InventoryDocumentPicker from "./InventoryDocumentPicker";
import InventoryStatusBadge from "./InventoryStatusBadge";
import { erpSurfaceCard } from "./theme";

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

/** Reports — standard ERP table + portal document picker (shell in {@link InventoryLayout}). */
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

  return (
    <div className={moduleListPageShellClass}>
      <div className={`${erpSurfaceCard} p-4`}>
        <FilterField label="Dokument">
          <InventoryDocumentPicker
            options={pickerOptions}
            value={selectedDocumentId}
            onChange={onSelectDocument}
          />
        </FilterField>
      </div>

      <div className={moduleListDataCardClass}>
        <div className={moduleListTableInteriorClass}>
          <div className={panelListDenseTableScrollWrapClass}>
            <table className={panelListDenseTableClass}>
              <thead className={panelListDenseTheadClass}>
                <tr>
                  <th className={`${panelListDenseThBase} w-1/4 text-left`}>Raport</th>
                  <th className={`${panelListDenseThBase} text-left`}>Opis</th>
                  <th className={`${panelListDenseThBase} text-left`}>Status</th>
                  <th className={`${panelListDenseThBase} text-right`}>Eksport</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr
                    key={report.kind}
                    className={`${panelListDenseRowClass} ${!selectedDocumentId ? "opacity-50" : ""}`}
                  >
                    <td className={`${panelListDenseTdBase} font-semibold text-slate-900`}>{report.label}</td>
                    <td className={`${panelListDenseTdBase} text-slate-600`}>
                      {inventoryReportDescription(report.kind)}
                    </td>
                    <td className={panelListDenseTdBase}>
                      <InventoryStatusBadge status={report.status} variant="report" />
                    </td>
                    <td className={`${panelListDenseTdBase} text-right`}>
                      <div className="flex items-center justify-end gap-3">
                        {report.formats.includes("pdf") ? (
                          <button
                            type="button"
                            disabled={!selectedDocumentId || downloadBusy != null}
                            onClick={() => onDownload(report.kind, "pdf")}
                            className="inline-flex items-center text-xs font-semibold text-slate-700 hover:text-slate-900 disabled:opacity-50"
                          >
                            {downloadBusy === `${report.kind}-pdf` ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <FileText className="mr-1 h-3.5 w-3.5 text-red-500" />
                            )}
                            PDF
                          </button>
                        ) : null}
                        {report.formats.includes("xlsx") ? (
                          <button
                            type="button"
                            disabled={!selectedDocumentId || downloadBusy != null}
                            onClick={() => onDownload(report.kind, "xlsx")}
                            className="inline-flex items-center text-xs font-semibold text-slate-700 hover:text-slate-900 disabled:opacity-50"
                          >
                            {downloadBusy === `${report.kind}-xlsx` ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <FileSpreadsheet className="mr-1 h-3.5 w-3.5 text-green-600" />
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
        {!selectedDocumentId ? (
          <p className="border-t border-slate-100 py-6 text-center text-sm text-slate-500">
            Wybierz dokument powyżej, aby wygenerować i pobrać raporty.
          </p>
        ) : null}
      </div>
    </div>
  );
}
