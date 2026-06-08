import { ChevronDown, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useState } from "react";

import type { InventoryDocumentRead } from "@/api/inventoryCountApi";
import { inventoryDocOptionLabel } from "./InventoryDocListRow";
import { inventoryReportDescription } from "../../inventoryCountUiLabels";
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

/** Reports — pixel match uploaded mockup. */
export default function InventoryReportsView({
  reports,
  documents,
  selectedDocumentId,
  onSelectDocument,
  onDownload,
  downloadBusy,
}: Props) {
  const [open, setOpen] = useState(false);
  const selectedDoc = documents.find((d) => d.id === selectedDocumentId);
  const selectedLabel = selectedDoc ? inventoryDocOptionLabel(selectedDoc) : "";

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Raporty inwentaryzacji</h2>
        <p className="mt-1 text-sm text-slate-500">Eksport PDF i XLSX dla wybranego dokumentu liczenia.</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/50 p-6">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Dokument</label>
          <div className="relative max-w-md">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <span className={selectedLabel ? "font-medium text-slate-900" : "text-slate-500"}>
                {selectedLabel || "— wybierz dokument —"}
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>

            {open ? (
              <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    onSelectDocument("");
                    setOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
                >
                  — wybierz dokument —
                </button>
                {documents.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => {
                      onSelectDocument(doc.id);
                      setOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  >
                    {inventoryDocOptionLabel(doc)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="w-1/4 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Raport</th>
                <th className="w-1/2 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Opis</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Eksport
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((report) => (
                <tr
                  key={report.kind}
                  className={`transition-colors hover:bg-slate-50 ${!selectedDocumentId ? "pointer-events-none opacity-50" : ""}`}
                >
                  <td className="px-6 py-4 font-medium text-slate-900">{report.label}</td>
                  <td className="px-6 py-4 text-slate-500">{inventoryReportDescription(report.kind)}</td>
                  <td className="px-6 py-4">
                    <InventoryStatusBadge status={report.status} variant="report" />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-3">
                      {report.formats.includes("pdf") ? (
                        <button
                          type="button"
                          disabled={!selectedDocumentId || downloadBusy != null}
                          onClick={() => onDownload(report.kind, "pdf")}
                          className="flex items-center text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                        >
                          {downloadBusy === `${report.kind}-pdf` ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="mr-1 h-4 w-4 text-red-500" />
                          )}
                          PDF
                        </button>
                      ) : null}
                      {report.formats.includes("xlsx") ? (
                        <button
                          type="button"
                          disabled={!selectedDocumentId || downloadBusy != null}
                          onClick={() => onDownload(report.kind, "xlsx")}
                          className="flex items-center text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                        >
                          {downloadBusy === `${report.kind}-xlsx` ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="mr-1 h-4 w-4 text-green-600" />
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
          {!selectedDocumentId ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Wybierz dokument powyżej, aby wygenerować i pobrać raporty.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
