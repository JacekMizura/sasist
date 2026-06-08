import { useCallback, useEffect, useState } from "react";

import { fetchInventoryCountDashboard, type InventoryDashboardPayload } from "@/api/inventoryCountApi";
import { erpInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import InventoryDashboardView from "@/modules/inventoryCount/ui/erp/InventoryDashboardView";
import { useWarehouse } from "@/context/WarehouseContext";

export default function InventoryCountDashboardPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? 1;
  const warehouseId = warehouse?.id;
  const [data, setData] = useState<InventoryDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await fetchInventoryCountDashboard(tenantId, warehouseId));
    } catch {
      setErr("Nie udało się wczytać pulpitu inwentaryzacji.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-sm text-slate-500">Wczytywanie…</p>;
  if (err) return <p className="text-sm text-rose-600">{err}</p>;
  if (!data) return null;

  return <InventoryDashboardView data={data} onNewInventory={erpInventoryCountPaths.wizard} />;
}
