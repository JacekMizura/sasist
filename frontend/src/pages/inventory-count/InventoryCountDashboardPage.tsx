import { useCallback, useEffect, useState } from "react";

import { fetchInventoryCountDashboard, type InventoryDashboardPayload } from "@/api/inventoryCountApi";
import InventoryDashboardView from "@/modules/inventoryCount/ui/erp/InventoryDashboardView";
import { ActiveWarehouseRequiredBanner } from "@/components/layout/ActiveWarehouseRequiredBanner";
import { useActiveWarehouseContext } from "@/hooks/useActiveWarehouseContext";
import { DAMAGE_TENANT_ID } from "@/pages/damage/damageShared";

export default function InventoryCountDashboardPage() {
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const tenantId = DAMAGE_TENANT_ID;
  const [data, setData] = useState<InventoryDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasActiveWarehouse || warehouseId == null) {
      setData(null);
      setLoading(false);
      return;
    }
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
  }, [tenantId, warehouseId, hasActiveWarehouse]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!hasActiveWarehouse) {
    return (
      <div className="p-4">
        <ActiveWarehouseRequiredBanner hint="Dokumenty inwentaryzacji tworzone są w aktywnym magazynie." />
      </div>
    );
  }

  if (loading) return <p className="text-sm text-slate-500">Wczytywanie…</p>;
  if (err) return <p className="text-sm text-rose-600">{err}</p>;
  if (!data) return null;

  return <InventoryDashboardView data={data} />;
}
