import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import {
  downloadInventoryReportBlob,
  fetchInventoryReportsCatalog,
  listInventoryDocuments,
  type InventoryDocumentRead,
} from "@/api/inventoryCountApi";
import { triggerBrowserDownload } from "@/modules/inventoryCount/erp/downloadHelpers";
import InventoryReportsView from "@/modules/inventoryCount/ui/erp/InventoryReportsView";
import { useWarehouse } from "@/context/WarehouseContext";

export default function InventoryCountReportsPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? 1;
  const [reports, setReports] = useState<
    { kind: string; label: string; formats: string[]; status: string }[]
  >([]);
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

  const onDownload = async (kind: string, format: "pdf" | "xlsx") => {
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
    <InventoryReportsView
      reports={reports}
      documents={documents}
      selectedDocumentId={documentId}
      onSelectDocument={setDocumentId}
      onDownload={onDownload}
      downloadBusy={busy}
    />
  );
}
