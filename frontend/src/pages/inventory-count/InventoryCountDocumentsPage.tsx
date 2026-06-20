import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import {
  createInventoryDocument,
  deleteInventoryDocument,
  listInventoryDocuments,
  updateInventoryWizard,
  type InventoryDocumentRead,
} from "@/api/inventoryCountApi";
import InventoryDocumentsView from "@/modules/inventoryCount/ui/erp/InventoryDocumentsView";
import { erpInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import { useActiveWarehouseContext } from "@/hooks/useActiveWarehouseContext";
import { ActiveWarehouseRequiredBanner } from "@/components/layout/ActiveWarehouseRequiredBanner";
import { DAMAGE_TENANT_ID } from "@/pages/damage/damageShared";

export default function InventoryCountDocumentsPage() {
  const navigate = useNavigate();
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const tenantId = DAMAGE_TENANT_ID;
  const [rows, setRows] = useState<InventoryDocumentRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);
  const [duplicateBusyId, setDuplicateBusyId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRows(await listInventoryDocuments(tenantId, { warehouseId: warehouseId ?? undefined }));
    } catch {
      setErr("Nie udało się wczytać dokumentów.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

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

  const handleDuplicate = useCallback(
    async (doc: InventoryDocumentRead) => {
      if (warehouseId == null) return;
      setDuplicateBusyId(doc.id);
      try {
        const created = await createInventoryDocument(tenantId, {
          warehouse_id: warehouseId,
          inventory_type: doc.inventory_type,
        });
        const updated = await updateInventoryWizard(tenantId, created.id, {
          inventory_type: doc.inventory_type,
          title: doc.title ? `${doc.title} (kopia)` : null,
          notes: doc.notes,
          filters: doc.filters,
          count_mode: doc.count_mode,
          lock_mode: doc.movement_policy ?? doc.lock_mode,
          strategy: doc.strategy,
        });
        toast.success(`Utworzono kopię: ${updated.number}`);
        navigate(erpInventoryCountPaths.wizardDoc(updated.id));
      } catch {
        toast.error("Nie udało się zduplikować dokumentu.");
      } finally {
        setDuplicateBusyId(null);
      }
    },
    [tenantId, warehouseId, navigate],
  );

  const handleExport = useCallback(
    (doc: InventoryDocumentRead) => {
      navigate(`${erpInventoryCountPaths.reports}?documentId=${doc.id}`);
    },
    [navigate],
  );

  if (!hasActiveWarehouse) {
    return (
      <div className="p-4">
        <ActiveWarehouseRequiredBanner />
      </div>
    );
  }

  return (
    <>
      {err ? <p className="mb-3 text-sm text-rose-600">{err}</p> : null}
      <InventoryDocumentsView
        documents={rows}
        loading={loading}
        deleteBusyId={deleteBusyId ?? duplicateBusyId}
        onDeleteDraft={handleDeleteDraft}
        onDuplicate={handleDuplicate}
        onExport={handleExport}
      />
    </>
  );
}
