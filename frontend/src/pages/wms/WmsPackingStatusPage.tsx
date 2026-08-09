import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getWmsPackingTargetStatuses } from "../../api/wmsPackingApi";
import { applyPackingHandoffScanResult, pickPreferredPackingStatus } from "../../components/wms/packing/applyPackingHandoffScan";
import { resolvePackingHandoffScan } from "../../components/wms/packing/resolvePackingHandoffScan";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WmsFlowStatusTileButton } from "./WmsFlowStatusTileButton";
import { loadWmsPackingSession, saveWmsPackingSession, type WmsPackingSessionState } from "./wmsPackingSession";
import { consumePendingPackingWorkstation } from "./WmsPackingWorkstationGate";
import { WMS_ROUTES } from "./wmsRoutes";

type StatusRow = Awaited<ReturnType<typeof getWmsPackingTargetStatuses>>[number];

function buildSessionBase(r: StatusRow): WmsPackingSessionState {
  const pending = consumePendingPackingWorkstation();
  const prev = loadWmsPackingSession();
  return {
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
  };
}

/**
 * Pakowanie — wybór statusu kolejki.
 * Po wyborze od razu lista zamówień (mode=all).
 * Globalny skaner: opcjonalny lookup wózek/koszyk → lista/zamówienie (bez forced scan UI).
 */
export default function WmsPackingStatusPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const {
    setActiveDocument,
    setScannerInputPlaceholder,
    refocusScannerInput,
    registerScanHandler,
    showScannerToast,
    appendScanToHistory,
  } = useWmsScanner();

  const [rows, setRows] = useState<StatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const rowsRef = useRef<StatusRow[]>([]);
  const scanBusyRef = useRef(false);

  rowsRef.current = rows;

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

  const onChooseStatus = useCallback(
    (r: StatusRow) => {
      if (warehouseId == null || busyId != null) return;
      setBusyId(r.target_status_id);
      setErr(null);
      try {
        saveWmsPackingSession(buildSessionBase(r));
        navigate(WMS_ROUTES.packingOrders, { replace: true });
      } finally {
        setBusyId(null);
      }
    },
    [warehouseId, busyId, navigate],
  );

  const handleStatusPageScan = useCallback(
    async (raw: string) => {
      if (warehouseId == null || scanBusyRef.current || busyId != null) return;
      const scan = normalizeScanEan(raw);
      if (!scan) return;

      const preferred = pickPreferredPackingStatus(rowsRef.current);
      if (!preferred) {
        showScannerToast("Brak kolejek pakowania — nie można rozpoznać skanu.");
        return;
      }

      scanBusyRef.current = true;
      try {
        const result = await resolvePackingHandoffScan({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId,
          statusId: preferred.target_status_id,
          raw: scan,
        });
        if (result.kind === "empty" || result.kind === "error") {
          showScannerToast(result.message);
          return;
        }
        if (result.notice) {
          showScannerToast(result.notice);
        }
        applyPackingHandoffScanResult({
          result,
          navigate,
          appendScanToHistory,
          sessionBase: buildSessionBase(preferred),
        });
      } catch {
        showScannerToast("Nie udało się rozpoznać skanu wózka / koszyka.");
      } finally {
        scanBusyRef.current = false;
        refocusScannerInput();
      }
    },
    [warehouseId, busyId, navigate, appendScanToHistory, showScannerToast, refocusScannerInput],
  );

  useEffect(() => {
    setScannerInputPlaceholder("Opcjonalnie zeskanuj wózek lub koszyk");
    refocusScannerInput();
    registerScanHandler((ean) => {
      void handleStatusPageScan(ean);
    });
    return () => registerScanHandler(null);
  }, [setScannerInputPlaceholder, refocusScannerInput, registerScanHandler, handleStatusPageScan]);

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
