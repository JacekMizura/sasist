import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import {
  downloadInventoryReportBlob,
  fetchInventoryReportsCatalog,
  listInventoryDocuments,
  type InventoryDocumentRead,
} from "@/api/inventoryCountApi";
import { triggerBrowserDownload } from "@/modules/inventoryCount/erp/downloadHelpers";
import InventoryReportsView from "@/modules/inventoryCount/ui/erp/InventoryReportsView";
import { useActiveWarehouseContext } from "@/hooks/useActiveWarehouseContext";
import { ActiveWarehouseRequiredBanner } from "@/components/layout/ActiveWarehouseRequiredBanner";
import { DAMAGE_TENANT_ID } from "@/pages/damage/damageShared";

export default function InventoryCountReportsPage() {
  const [searchParams] = useSearchParams();
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const tenantId = DAMAGE_TENANT_ID;
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
    void listInventoryDocuments(tenantId, { warehouseId: warehouseId ?? undefined })
      .then(setDocuments)
      .catch(() => setDocuments([]));
  }, [tenantId, warehouseId]);

  useEffect(() => {
    const raw = searchParams.get("documentId");
    if (!raw) return;
    const id = Number(raw);
    if (Number.isFinite(id) && id > 0) setDocumentId(id);
  }, [searchParams]);

  if (!hasActiveWarehouse) {
    return (
      <div className="p-4">
        <ActiveWarehouseRequiredBanner />
      </div>
    );
  }

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
