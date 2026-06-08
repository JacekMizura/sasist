import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";

import { fetchInventoryReportsCatalog } from "../../api/inventoryCountApi";

export default function InventoryCountReportsPage() {
  const [reports, setReports] = useState<{ kind: string; label: string; formats: string[]; status: string }[]>([]);

  useEffect(() => {
    void fetchInventoryReportsCatalog().then((r) => setReports(r.reports)).catch(() => setReports([]));
  }, []);

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">Raporty inwentaryzacji</h2>
      <p className="mt-1 text-sm text-slate-500">Eksport PDF i XLSX — silnik raportów w fazie 2.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <div key={r.kind} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="font-medium text-slate-900">{r.label}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">{r.status}</p>
            <div className="mt-4 flex gap-2">
              {r.formats.includes("pdf") ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">
                  <FileText className="h-3.5 w-3.5" /> PDF
                </span>
              ) : null}
              {r.formats.includes("xlsx") ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> XLSX
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
