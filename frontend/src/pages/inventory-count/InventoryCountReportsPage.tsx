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
import { inventoryDocOptionLabel } from "../../modules/inventoryCount/erp/components/InventoryDocListRow";
import { InventoryPageHeader, InventorySection } from "../../modules/inventoryCount/erp/components/InventoryPageShell";
import { ERP_INV } from "../../modules/inventoryCount/erp/erpInventoryTheme";
import {
  inventoryReportDescription,
  inventoryReportStatusBadgeClass,
  inventoryReportStatusLabel,
} from "../../modules/inventoryCount/inventoryCountUiLabels";
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
    <div className="space-y-3">
      <InventoryPageHeader
        title="Raporty inwentaryzacji"
        subtitle="Eksport PDF i XLSX dla wybranego dokumentu liczenia."
      />

      <InventorySection title="Dokument">
        <div className="px-3 py-2">
          <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Dokument inwentaryzacji
            <select
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 block w-full max-w-lg rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-900"
            >
              <option value="">— wybierz dokument —</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {inventoryDocOptionLabel(d)}
                </option>
              ))}
            </select>
          </label>
          {documents.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              Brak dokumentów.{" "}
              <Link to={erpInventoryCountPaths.documents} className="font-semibold text-slate-800 hover:underline">
                Przejdź do listy
              </Link>
            </p>
          ) : null}
        </div>
      </InventorySection>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className={ERP_INV.table}>
          <thead>
            <tr>
              <th className={ERP_INV.th}>Raport</th>
              <th className={ERP_INV.th}>Opis</th>
              <th className={ERP_INV.th}>Status</th>
              <th className={ERP_INV.th}>Eksport</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.kind} className={ERP_INV.row}>
                <td className={`${ERP_INV.td} font-semibold text-slate-900`}>{r.label}</td>
                <td className={`${ERP_INV.td} max-w-md text-slate-600`}>{inventoryReportDescription(r.kind)}</td>
                <td className={ERP_INV.td}>
                  <span className={inventoryReportStatusBadgeClass(r.status)}>
                    {inventoryReportStatusLabel(r.status)}
                  </span>
                </td>
                <td className={ERP_INV.td}>
                  <div className="flex flex-wrap gap-1">
                    {r.formats.includes("pdf") ? (
                      <button
                        type="button"
                        disabled={!documentId || busy != null}
                        onClick={() => void download(r.kind, "pdf")}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-50"
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
                        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-50"
                      >
                        {busy === `${r.kind}-xlsx` ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />}
                        XLSX
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {reports.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-xs text-slate-500">
                  Brak zdefiniowanych raportów.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
