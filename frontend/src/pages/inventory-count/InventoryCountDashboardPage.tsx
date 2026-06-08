import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  fetchInventoryCountDashboard,
  type InventoryDashboardPayload,
} from "../../api/inventoryCountApi";
import { InventoryDocListRow } from "../../modules/inventoryCount/erp/components/InventoryDocListRow";
import {
  InventoryKpiTile,
  InventoryPageHeader,
  InventorySection,
} from "../../modules/inventoryCount/erp/components/InventoryPageShell";
import { erpInventoryCountPaths } from "../../modules/inventoryCount/inventoryCountPaths";
import { useWarehouse } from "../../context/WarehouseContext";

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
      const payload = await fetchInventoryCountDashboard(tenantId, warehouseId);
      setData(payload);
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

  if (loading) return <p className="text-xs text-slate-500">Wczytywanie…</p>;
  if (err) return <p className="text-xs text-rose-600">{err}</p>;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <InventoryPageHeader
        title="Pulpit inwentaryzacji"
        subtitle="Aktywne liczenia, różnice i zatwierdzenia — liczenie w terminalu WMS."
        actions={
          <Link
            to={erpInventoryCountPaths.wizard}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Nowa inwentaryzacja
          </Link>
        }
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <InventoryKpiTile label="Aktywne" value={data.kpis.active_inventories} />
        <InventoryKpiTile label="Do zatwierdzenia" value={data.kpis.awaiting_approval} />
        <InventoryKpiTile label="Otwarte różnice" value={data.kpis.open_differences} />
        <InventoryKpiTile label="Pokrycie magazynu" value={`${data.kpis.warehouse_coverage_percent}%`} />
        <InventoryKpiTile label="Zakończone (7 dni)" value={data.kpis.completed_last_7_days} />
        <InventoryKpiTile label="Sesje operatorów" value={data.kpis.active_operator_sessions} />
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        <InventorySection title="Aktywne inwentaryzacje">
          <div>
            {data.active_inventories.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-500">Brak aktywnych.</p>
            ) : (
              data.active_inventories.map((d) => <InventoryDocListRow key={d.id} doc={d} />)
            )}
          </div>
        </InventorySection>
        <InventorySection title="Do zatwierdzenia">
          <div>
            {data.awaiting_approval.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-500">Brak oczekujących.</p>
            ) : (
              data.awaiting_approval.map((d) => <InventoryDocListRow key={d.id} doc={d} />)
            )}
          </div>
        </InventorySection>
        <InventorySection title="Ostatnio zakończone">
          <div>
            {data.recent_completed.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-500">Brak w ostatnich 7 dniach.</p>
            ) : (
              data.recent_completed.map((d) => <InventoryDocListRow key={d.id} doc={d} />)
            )}
          </div>
        </InventorySection>
      </div>
    </div>
  );
}
