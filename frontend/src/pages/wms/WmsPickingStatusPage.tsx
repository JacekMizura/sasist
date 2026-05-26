import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPickingConfiguredStatuses, getWmsPickingFlowConfig } from "../../api/wmsPickingEntryApi";
import { getWmsPickingProductLines } from "../../api/wmsPickingProductsApi";
import { useWmsPickingCart } from "../../context/WmsPickingCartContext";
import { useWarehouse } from "../../context/WarehouseContext";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WmsFlowStatusTileButton } from "./WmsFlowStatusTileButton";
import { resolveAfterStatusWithConfig, sessionWithPickingFlowConfig } from "./wmsPickingFlowResolve";
import { computeWmsPickingProductLineSessionStats, wmsPickingDisplayPickedQuantity } from "./wmsPickingUiGates";
import { Loader2, AlertTriangle } from "lucide-react";

export default function WmsPickingStatusPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { clearPickingCart } = useWmsPickingCart();

  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPickingConfiguredStatuses>>>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resolvingStatusId, setResolvingStatusId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setRows([]);
      setErr(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await getPickingConfiguredStatuses(DAMAGE_TENANT_ID, warehouseId);
      setRows(data);
    } catch {
      setErr("Nie udało się wczytać statusów z konfiguracji zbierania.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onChoose = async (r: (typeof rows)[number]) => {
    if (warehouseId == null || resolvingStatusId != null) return;
    clearPickingCart();
    const base = {
      orderUiStatusId: r.source_status_id,
      orderUiStatusName: r.status,
      orderUiStatusColor: r.color,
      mainGroup: r.main_group as OrderUiMainGroup,
    };
    setResolvingStatusId(r.source_status_id);
    setErr(null);
    try {
      const [cfg, linesResult] = await Promise.all([
        getWmsPickingFlowConfig(DAMAGE_TENANT_ID, warehouseId, r.source_status_id),
        getWmsPickingProductLines(DAMAGE_TENANT_ID, warehouseId, r.source_status_id, "all", null).catch(() => null),
      ]);
      let hubOrderCount = Number(r.order_count) || 0;
      let hubPickStats = { zebrane: 0, doZebrania: 0, wTrakcie: 0 };
      if (linesResult) {
        const normalized = (linesResult.products ?? []).map((row) => ({
          ...row,
          picked_quantity: wmsPickingDisplayPickedQuantity(row),
        }));
        hubPickStats = computeWmsPickingProductLineSessionStats(normalized);
        if (typeof linesResult.cohort_order_count === "number") {
          hubOrderCount = linesResult.cohort_order_count;
        }
      }
      const session = sessionWithPickingFlowConfig(base, cfg);
      const enriched = { ...session, hubOrderCount, hubPickStats };
      const { path, state } = resolveAfterStatusWithConfig(enriched);
      navigate(path, { state });
    } catch {
      setErr("Nie udało się wczytać konfiguracji zbierania dla tego statusu.");
    } finally {
      setResolvingStatusId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
        
        {warehouseId == null ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-center text-sm font-bold uppercase tracking-widest text-amber-700 shadow-sm">
            Wybierz magazyn w pasku u góry
          </p>
        ) : null}

        {err ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-center text-sm font-bold text-red-800 shadow-sm">
            {err}
          </p>
        ) : null}

        {warehouseId != null && loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 size={40} className="animate-spin mb-4 text-[#5a4fcf]" strokeWidth={2.5} />
            <p className="font-black uppercase tracking-widest text-[11px]">Ładowanie kolejek...</p>
          </div>
        ) : null}

        {warehouseId != null && !loading && !err && rows.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-slate-100 bg-slate-50 text-slate-400 shadow-sm">
              <AlertTriangle size={32} strokeWidth={2.5} />
            </div>
            <p className="mb-2 text-lg font-bold text-slate-900">Brak skonfigurowanych statusów</p>
          </div>
        ) : null}

        {warehouseId != null && !loading && !err && rows.length > 0 ? (
          <ul
            className="grid w-full list-none grid-cols-1 gap-4 p-0 m-0 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Statusy skonfigurowane do zbierania"
          >
            {rows.map((r) => (
              <li key={r.source_status_id} className="min-w-0">
                <WmsFlowStatusTileButton
                  variant="work"
                  statusName={r.status}
                  orderCount={r.order_count}
                  color={r.color}
                  mainGroup={r.main_group as OrderUiMainGroup}
                  requireCart={r.require_cart}
                  cartType={r.cart_type}
                  disabled={warehouseId == null || resolvingStatusId != null}
                  loading={resolvingStatusId === r.source_status_id}
                  onClick={() => void onChoose(r)}
                />
              </li>
            ))}
          </ul>
        ) : null}
        
      </div>
    </div>
  );
}