import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getWmsPackingTargetStatuses } from "../../api/wmsPackingApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WmsFlowStatusTileButton } from "./WmsFlowStatusTileButton";
import { loadWmsPackingSession, saveWmsPackingSession } from "./wmsPackingSession";
import { consumePendingPackingWorkstation } from "./WmsPackingWorkstationGate";
import { WMS_ROUTES } from "./wmsRoutes";

type StatusRow = Awaited<ReturnType<typeof getWmsPackingTargetStatuses>>[number];

/**
 * Pakowanie — wybór statusu kolejki.
 * Po wyborze od razu lista zamówień (mode=all). Skan wózka/koszyka = dodatkowy lookup na liście.
 */
export default function WmsPackingStatusPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { setActiveDocument, setScannerInputPlaceholder, refocusScannerInput, registerScanHandler } =
    useWmsScanner();

  const [rows, setRows] = useState<StatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadStatuses = useCallback(async () => {
    if (warehouseId == null) {
      setRows([]);
      setErr(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await getWmsPackingTargetStatuses(DAMAGE_TENANT_ID, warehouseId);
      setRows(data);
    } catch {
      setErr("Nie udało się wczytać statusów kolejki pakowania.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void loadStatuses();
  }, [loadStatuses]);

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Pakowanie — statusy" });
    return () => setActiveDocument(null);
  }, [setActiveDocument]);

  useEffect(() => {
    setScannerInputPlaceholder("Wybierz status kolejki pakowania");
    refocusScannerInput();
    registerScanHandler(null);
    return () => registerScanHandler(null);
  }, [setScannerInputPlaceholder, refocusScannerInput, registerScanHandler]);

  const onChooseStatus = (r: StatusRow) => {
    if (warehouseId == null || busyId != null) return;
    setBusyId(r.target_status_id);
    setErr(null);
    try {
      const pending = consumePendingPackingWorkstation();
      const prev = loadWmsPackingSession();
      saveWmsPackingSession({
        statusId: r.target_status_id,
        statusName: r.status,
        statusColor: r.color,
        mainGroup: r.main_group as OrderUiMainGroup,
        mode: "all",
        orderTypeFilter: "all",
        cartId: undefined,
        cartCode: undefined,
        cartType: undefined,
        workstationId: pending.workstationId ?? prev?.workstationId,
        workstationName: pending.workstationName ?? prev?.workstationName,
      });
      navigate(WMS_ROUTES.packingOrders, { replace: true });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        {warehouseId == null ? (
          <p className="rounded-2xl border border-amber-200/90 bg-amber-50 px-4 py-4 text-center text-sm font-medium text-amber-950 shadow-sm">
            Wybierz magazyn w pasku u góry.
          </p>
        ) : null}

        {err ? (
          <p className="mt-4 rounded-2xl border border-red-200/90 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-900 shadow-sm">
            {err}
          </p>
        ) : null}

        {warehouseId != null && loading ? (
          <p className="py-16 text-center text-base font-medium text-slate-500">Ładowanie…</p>
        ) : null}

        {warehouseId != null && !loading && !err && rows.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm leading-relaxed text-slate-600 shadow-sm">
            Brak kolejek pakowania. Ustaw{" "}
            <span className="font-medium text-slate-800">status do rozpoczęcia pakowania</span> w Ustawieniach WMS →
            Pakowanie (gdy nie korzystasz ze zbierania) albo reguły ze statusem po zbieraniu w{" "}
            <span className="font-medium text-slate-800">Ustawienia WMS → Zbieranie</span>.
          </p>
        ) : null}

        <ul
          className="mt-6 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Statusy kolejki pakowania"
        >
          {rows.map((r) => (
            <li key={r.target_status_id} className="min-w-0">
              <WmsFlowStatusTileButton
                variant="work"
                statusName={r.status}
                orderCount={r.order_count}
                color={r.color}
                mainGroup={r.main_group as OrderUiMainGroup}
                requireCart={false}
                cartType={null}
                disabled={warehouseId == null || busyId != null}
                onClick={() => onChooseStatus(r)}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
