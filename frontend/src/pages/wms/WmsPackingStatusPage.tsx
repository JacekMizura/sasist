import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getWmsPackingModes, getWmsPackingTargetStatuses } from "../../api/wmsPackingApi";
import {
  applyPackingHandoffScanResult,
  isPackingNamedStatus,
  pickPreferredPackingStatus,
} from "../../components/wms/packing/applyPackingHandoffScan";
import { PackingModeSelectionView } from "../../components/wms/packing/PackingModeSelectionView";
import { resolvePackingHandoffScan } from "../../components/wms/packing/resolvePackingHandoffScan";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import { classifyWmsScanCode } from "../../utils/wmsScanClassify";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WmsFlowStatusTileButton } from "./WmsFlowStatusTileButton";
import { loadWmsPackingExtendedUi } from "../../types/wmsPackingExtendedUi";
import { loadWmsPackingSession, saveWmsPackingSession } from "./wmsPackingSession";
import { consumePendingPackingWorkstation } from "./WmsPackingWorkstationGate";

type FlowPhase = "pick_status" | "pick_mode";
type StatusRow = Awaited<ReturnType<typeof getWmsPackingTargetStatuses>>[number];

export default function WmsPackingStatusPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const {
    registerScanHandler,
    setActiveDocument,
    showScannerToast,
    showScannerError,
    setScannerInputPlaceholder,
    refocusScannerInput,
    appendScanToHistory,
  } = useWmsScanner();

  const [rows, setRows] = useState<StatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [flowPhase, setFlowPhase] = useState<FlowPhase>("pick_status");
  const [modes, setModes] = useState<{
    no_cart: number;
    bulk: number;
    baskets: number;
    single_item?: number;
    multi_item?: number;
  } | null>(null);
  const [modesLoading, setModesLoading] = useState(false);
  const [modesErr, setModesErr] = useState<string | null>(null);
  const [autoOpenHandoffScan, setAutoOpenHandoffScan] = useState(false);
  const scanBusyRef = useRef(false);

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

  const loadModesForStatus = useCallback(
    async (statusId: number) => {
      if (warehouseId == null) return;
      setModesLoading(true);
      setModesErr(null);
      try {
        const d = await getWmsPackingModes(DAMAGE_TENANT_ID, warehouseId, statusId);
        setModes(d);
      } catch {
        setModesErr("Nie udało się wczytać trybów pakowania.");
        setModes(null);
      } finally {
        setModesLoading(false);
      }
    },
    [warehouseId],
  );

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Pakowanie — statusy" });
    return () => setActiveDocument(null);
  }, [setActiveDocument]);

  const bindStatusSession = useCallback((r: StatusRow) => {
    const pending = consumePendingPackingWorkstation();
    const prev = loadWmsPackingSession();
    const next = {
      statusId: r.target_status_id,
      statusName: r.status,
      statusColor: r.color,
      mainGroup: r.main_group as OrderUiMainGroup,
      workstationId: pending.workstationId ?? prev?.workstationId,
      workstationName: pending.workstationName ?? prev?.workstationName,
    };
    saveWmsPackingSession(next);
    return next;
  }, []);

  const onChooseStatus = (r: StatusRow, opts?: { openHandoffScan?: boolean }) => {
    if (warehouseId == null || busyId != null) return;
    setBusyId(r.target_status_id);
    setErr(null);
    try {
      bindStatusSession(r);
      setAutoOpenHandoffScan(Boolean(opts?.openHandoffScan));
      setFlowPhase("pick_mode");
      void loadModesForStatus(r.target_status_id);
    } finally {
      setBusyId(null);
    }
  };

  const runHandoffScanWithStatus = useCallback(
    async (raw: string, statusRow: StatusRow) => {
      if (warehouseId == null || scanBusyRef.current) return;
      scanBusyRef.current = true;
      try {
        const sessionBase = bindStatusSession(statusRow);
        const result = await resolvePackingHandoffScan({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId,
          statusId: statusRow.target_status_id,
          raw,
        });
        if (result.kind === "empty" || result.kind === "error") {
          showScannerToast(result.message);
          return;
        }
        setStatusPageHandoffOpen(false);
        applyPackingHandoffScanResult({
          result,
          navigate,
          appendScanToHistory,
          sessionBase,
        });
      } finally {
        scanBusyRef.current = false;
        refocusScannerInput();
      }
    },
    [warehouseId, bindStatusSession, showScannerToast, navigate, appendScanToHistory, refocusScannerInput],
  );

  useEffect(() => {
    if (flowPhase === "pick_status") {
      setScannerInputPlaceholder("Skanuj wózek / koszyk albo wybierz status");
      refocusScannerInput();
    }
  }, [flowPhase, setScannerInputPlaceholder, refocusScannerInput]);

  const handleScanPickStatus = useCallback(
    async (raw: string) => {
      const scan = normalizeScanEan(raw);
      if (!scan || warehouseId == null || scanBusyRef.current) return;
      const kind = classifyWmsScanCode(scan);

      if (kind === "ean_gtin") {
        showScannerError(`Zeskanowano produkt ${scan}, najpierw wejdź w odpowiedni status`);
        return;
      }

      const preferred = pickPreferredPackingStatus(rows);
      if (!preferred) {
        showScannerToast("Brak statusów kolejki pakowania — skonfiguruj status startowy w ustawieniach.");
        return;
      }

      await runHandoffScanWithStatus(scan, preferred);
    },
    [warehouseId, rows, showScannerError, showScannerToast, runHandoffScanWithStatus],
  );

  useEffect(() => {
    if (flowPhase !== "pick_status") {
      registerScanHandler(null);
      return;
    }
    registerScanHandler((r) => {
      void handleScanPickStatus(r);
    });
    return () => registerScanHandler(null);
  }, [flowPhase, registerScanHandler, handleScanPickStatus]);

  const session = loadWmsPackingSession();
  const showSingleMulti =
    warehouseId != null ? loadWmsPackingExtendedUi(warehouseId).packingBySingleOrMultiItemEnabled : false;
  const totalModes = modes
    ? modes.no_cart +
      modes.bulk +
      modes.baskets +
      (showSingleMulti ? (modes.single_item ?? 0) + (modes.multi_item ?? 0) : 0)
    : 0;

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

        {flowPhase === "pick_mode" && session && warehouseId != null ? (
          <div className="mb-6">
            {modesErr ? (
              <p className="rounded-2xl border border-red-200/90 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 shadow-sm">
                {modesErr}
              </p>
            ) : null}
            {modesLoading ? (
              <p className="py-10 text-center text-sm font-medium text-slate-500">Ładowanie trybów…</p>
            ) : modes && totalModes === 0 && !showSingleMulti ? (
              <p className="mt-4 rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm leading-relaxed text-slate-600 shadow-sm">
                Brak zamówień do pakowania w tym statusie (wg podziału na wózki).
              </p>
            ) : modes ? (
              <PackingModeSelectionView
                statusName={session.statusName}
                statusColor={session.statusColor}
                mainGroup={session.mainGroup}
                modes={modes}
                warehouseId={warehouseId}
                showSingleMultiTiles={showSingleMulti}
                autoOpenHandoffScan={autoOpenHandoffScan}
              />
            ) : null}
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => {
                  setFlowPhase("pick_status");
                  setAutoOpenHandoffScan(false);
                  setModes(null);
                }}
              >
                ← Wróć do statusów
              </button>
            </div>
          </div>
        ) : null}

        {flowPhase === "pick_status" ? (
          <ul
            className="mt-6 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Statusy kolejki pakowania"
          >
            {rows.map((r) => {
              const packingNamed = isPackingNamedStatus(r.status);
              return (
                <li key={r.target_status_id} className="min-w-0 space-y-2">
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
                  {packingNamed ? (
                    <button
                      type="button"
                      disabled={warehouseId == null || busyId != null}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                      onClick={() => onChooseStatus(r, { openHandoffScan: true })}
                    >
                      Skanuj wózek / koszyk
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
