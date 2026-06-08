import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

import {
  downloadInventoryReportBlob,
  fetchInventoryReportsCatalog,
  listInventoryDocuments,
  type InventoryDocumentRead,
} from "../../api/inventoryCountApi";
import { ERP_INV } from "../../modules/inventoryCount/erp/erpInventoryTheme";
import { triggerBrowserDownload } from "../../modules/inventoryCount/erp/downloadHelpers";
import { erpInventoryCountPaths } from "../../modules/inventoryCount/inventoryCountPaths";
import { useWarehouse } from "../../context/WarehouseContext";

export default function InventoryCountReportsPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? 1;
  const [reports, setReports] = useState<{ kind: string; label: string; formats: string[]; status: string }[]>([]);
  const [documents, setDocuments] = useState<InventoryDocumentRead[]>([]);
  const [documentId, setDocumentId] = useState<number | "">("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void fetchInventoryReportsCatalog()
      .then((r) => setReports(r.reports))
      .catch(() => setReports([]));
    void listInventoryDocuments(tenantId, { warehouseId: warehouse?.id })
      .then(setDocuments)
      .catch(() => setDocuments([]));
  }, [tenantId, warehouse?.id]);

  const download = async (kind: string, format: "pdf" | "xlsx") => {
    if (!documentId) {
      toast.error("Wybierz dokument inwentaryzacji.");
      return;
    }
    const key = `${kind}-${format}`;
    setBusy(key);
    try {
      const { blob, fileName } = await downloadInventoryReportBlob(tenantId, Number(documentId), kind, format);
      triggerBrowserDownload(blob, fileName);
      toast.success(`Pobrano: ${fileName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pobieranie nie powiodło się.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Raporty inwentaryzacji</h2>
        <p className="text-xs text-slate-500">Eksport PDF / XLSX dla wybranego dokumentu</p>
      </div>

      <div className={`${ERP_INV.section} p-3`}>
        <label className="block text-xs font-semibold text-slate-700">
          Dokument
          <select
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value ? Number(e.target.value) : "")}
            className="mt-1 block w-full max-w-md rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">— wybierz —</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.number} ({d.status})
              </option>
            ))}
          </select>
        </label>
        {documents.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            Brak aktywnych dokumentów.{" "}
            <Link to={erpInventoryCountPaths.documents} className="text-teal-700 hover:underline">
              Przejdź do listy
            </Link>
          </p>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <div key={r.kind} className={`${ERP_INV.section} p-3`}>
            <p className="text-sm font-semibold text-slate-900">{r.label}</p>
            <p className="text-[10px] uppercase text-slate-400">{r.status}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.formats.includes("pdf") ? (
                <button
                  type="button"
                  disabled={!documentId || busy != null}
                  onClick={() => void download(r.kind, "pdf")}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy === `${r.kind}-pdf` ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                  PDF
                </button>
              ) : null}
              {r.formats.includes("xlsx") ? (
                <button
                  type="button"
                  disabled={!documentId || busy != null}
                  onClick={() => void download(r.kind, "xlsx")}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy === `${r.kind}-xlsx` ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />}
                  XLSX
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
