import { useCallback, useEffect, useState } from "react";

import { listInventoryDocuments, type InventoryDocumentRead } from "@/api/inventoryCountApi";
import InventoryDocumentsView from "@/modules/inventoryCount/ui/erp/InventoryDocumentsView";
import { useWarehouse } from "@/context/WarehouseContext";

export default function InventoryCountDocumentsPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? 1;
  const [rows, setRows] = useState<InventoryDocumentRead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listInventoryDocuments(tenantId, { warehouseId: warehouse?.id }));
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouse?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return <InventoryDocumentsView documents={rows} loading={loading} />;
}
