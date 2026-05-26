import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { getWmsPackingModes, getWmsPackingTargetStatuses } from "../../api/wmsPackingApi";
import { getWmsPickingResolveCart } from "../../api/wmsPickingProductsApi";
import { PackingModeSelectionView } from "../../components/wms/packing/PackingModeSelectionView";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import { classifyWmsScanCode } from "../../utils/wmsScanClassify";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WmsFlowStatusTileButton } from "./WmsFlowStatusTileButton";
import { clearWmsPackingSession, loadWmsPackingSession, saveWmsPackingSession } from "./wmsPackingSession";

type FlowPhase = "pick_status" | "pick_mode";

export default function WmsPackingStatusPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const {
    registerScanHandler,
    setActiveDocument,
    showScannerToast,
    showScannerError,
    setScannerInputPlaceholder,
    refocusScannerInput,
  } = useWmsScanner();

  const [rows, setRows] = useState<Awaited<ReturnType<typeof getWmsPackingTargetStatuses>>>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [flowPhase, setFlowPhase] = useState<FlowPhase>("pick_status");
  const [modes, setModes] = useState<{ no_cart: number; bulk: number; baskets: number } | null>(null);
  const [modesLoading, setModesLoading] = useState(false);
  const [modesErr, setModesErr] = useState<string | null>(null);
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

  const loadModesForStatus = useCallback(async (statusId: number) => {
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
  }, [warehouseId]);

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Pakowanie — statusy" });
    return () => setActiveDocument(null);
  }, [setActiveDocument]);

  useEffect(() => {
    if (flowPhase === "pick_status") {
      setScannerInputPlaceholder("Wybierz status lub zeskanuj wózek po wyborze statusu");
      refocusScannerInput();
    }
  }, [flowPhase, setScannerInputPlaceholder, refocusScannerInput]);

  const handleScanPickStatus = useCallback(
    async (raw: string) => {
      const scan = normalizeScanEan(raw);
      if (!scan || warehouseId == null || scanBusyRef.current) return;
      const kind = classifyWmsScanCode(scan);
      const session = loadWmsPackingSession();

      scanBusyRef.current = true;
      try {
        let cartResult: Awaited<ReturnType<typeof getWmsPickingResolveCart>> | null = null;
        try {
          cartResult = await getWmsPickingResolveCart(DAMAGE_TENANT_ID, warehouseId, scan);
        } catch (e) {
          cartResult = null;
          if (axios.isAxiosError(e) && e.response != null && e.response.status >= 500) {
            showScannerToast("Błąd serwera przy rozpoznawaniu wózka.");
            return;
          }
        }

        if (cartResult != null) {
          if (!session?.statusId) {
            showScannerToast("Zeskanowano wózek — najpierw wybierz status kolejki (kafelek).");
            return;
          }
          showScannerToast("Wybierz status, potem użyj „Zeskanuj wózek” na kolejnym ekranie.");
          return;
        }

        if (kind === "ean_gtin") {
          showScannerError(`Zeskanowano produkt ${scan}, najpierw wejdź w odpowiedni status`);
          return;
        }

        if (kind === "cart_like") {
          showScannerToast("Nie rozpoznano wózka — sprawdź kod.");
          return;
        }

        showScannerError(`Zeskanowano produkt ${scan}, najpierw wejdź w odpowiedni status`);
      } finally {
        scanBusyRef.current = false;
        refocusScannerInput();
      }
    },
    [warehouseId, showScannerToast, showScannerError, refocusScannerInput],
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

  const onChooseStatus = (r: (typeof rows)[number]) => {
    if (warehouseId == null || busyId != null) return;
    setBusyId(r.target_status_id);
    setErr(null);
    try {
      clearWmsPackingSession();
      saveWmsPackingSession({
        statusId: r.target_status_id,
        statusName: r.status,
        statusColor: r.color,
        mainGroup: r.main_group as OrderUiMainGroup,
      });
      setFlowPhase("pick_mode");
      void loadModesForStatus(r.target_status_id);
    } finally {
      setBusyId(null);
    }
  };

  const session = loadWmsPackingSession();
  const totalModes = modes ? modes.no_cart + modes.bulk + modes.baskets : 0;

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
            Brak statusów docelowych z konfiguracji zbierania. W{" "}
            <span className="font-medium text-slate-800">Ustawienia WMS → Zbieranie</span> ustaw reguły ze statusem po
            zbieraniu — wtedy pojawią się tu kolejki pakowania.
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
            ) : modes && totalModes === 0 ? (
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
              />
            ) : null}
          </div>
        ) : null}

        {flowPhase === "pick_status" ? (
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
        ) : null}
      </div>
    </div>
  );
}
