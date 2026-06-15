import { useCallback, useEffect, useState } from "react";

import {
  deleteInventoryDocument,
  listInventoryDocuments,
  type InventoryDocumentRead,
} from "@/api/inventoryCountApi";
import InventoryDocumentsView from "@/modules/inventoryCount/ui/erp/InventoryDocumentsView";
import { useWarehouse } from "@/context/WarehouseContext";

export default function InventoryCountDocumentsPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id;
  const [rows, setRows] = useState<InventoryDocumentRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRows(await listInventoryDocuments(tenantId, { warehouseId: warehouse?.id }));
    } catch {
      setErr("Nie udało się wczytać dokumentów.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouse?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDeleteDraft = useCallback(
    async (doc: InventoryDocumentRead) => {
      setDeleteBusyId(doc.id);
      const snapshot = rows;
      setRows((prev) => prev.filter((r) => r.id !== doc.id));
      try {
        await deleteInventoryDocument(tenantId, doc.id);
      } catch {
        setRows(snapshot);
        setErr("Nie udało się usunąć wersji roboczej.");
        throw new Error("delete failed");
      } finally {
        setDeleteBusyId(null);
      }
    },
    [rows, tenantId],
  );

  return (
    <>
      {err ? <p className="mb-3 text-sm text-rose-600">{err}</p> : null}
      <InventoryDocumentsView
        documents={rows}
        loading={loading}
        deleteBusyId={deleteBusyId}
        onDeleteDraft={handleDeleteDraft}
      />
    </>
  );
}
