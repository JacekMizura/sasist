import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { extractApiErrorMessage } from "../../api/authApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import {
  getWmsOrderIssueTask,
  resolveWmsOrderIssueTaskScan,
  type OrderIssueTaskListItemApi,
} from "../../api/wmsOrderIssueTasksApi";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { useWmsShortagesRefresh } from "../../hooks/useWmsShortagesRefresh";
import { WMS_ROUTES } from "./wmsRoutes";
import { WmsOrderIssueDetailContent } from "./WmsOrderIssueDetailContent";

/** Szczegóły pozycji kolejki braków — shell ładowania + skan; UI w `WmsOrderIssueDetailContent`. */
export default function WmsOrderIssueDetailPage() {
  const { taskId: taskIdParam } = useParams();
  const taskId = Number(taskIdParam);
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const navigate = useNavigate();
  const {
    registerScanHandler,
    showScannerError,
    appendScanToHistory,
    setScannerInputPlaceholder,
    refocusScannerInput,
  } = useWmsScanner();

  const [task, setTask] = useState<OrderIssueTaskListItemApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (warehouseId == null || !Number.isFinite(taskId) || taskId < 1) {
      setTask(null);
      setLoading(false);
      setErr("Nieprawidłowe zadanie.");
      return;
    }
    setLoading(true);
    setErr(null);
    getWmsOrderIssueTask(DAMAGE_TENANT_ID, warehouseId, taskId)
      .then(setTask)
      .catch((e: unknown) => {
        setTask(null);
        setErr(extractApiErrorMessage(e, "Nie udało się wczytać zadania braków."));
      })
      .finally(() => setLoading(false));
  }, [warehouseId, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useWmsShortagesRefresh(() => void load(), { debounceMs: 600 });

  useEffect(() => {
    setScannerInputPlaceholder("Inne zamówienie — zeskanuj kod");
    return () => setScannerInputPlaceholder("Wpisz lub wklej EAN (↑↓ historia)");
  }, [setScannerInputPlaceholder]);

  const switchTaskByScan = useCallback(
    async (raw: string) => {
      const scan = normalizeScanEan(raw);
      if (!scan || warehouseId == null) return;
      try {
        const next = await resolveWmsOrderIssueTaskScan(DAMAGE_TENANT_ID, warehouseId, scan);
        appendScanToHistory(scan);
        navigate(WMS_ROUTES.issueTask(next.id), { replace: true });
        refocusScannerInput();
      } catch {
        showScannerError("Brak zamówienia lub brak otwartego zgłoszenia braków.");
        refocusScannerInput();
      }
    },
    [appendScanToHistory, navigate, refocusScannerInput, showScannerError, warehouseId],
  );

  useEffect(() => {
    registerScanHandler((ean) => {
      void switchTaskByScan(ean);
    });
    return () => registerScanHandler(null);
  }, [registerScanHandler, switchTaskByScan]);

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center text-slate-600">
        <p>Wybierz magazyn w nagłówku.</p>
        <div className="mt-6">
          <Link to={WMS_ROUTES.braki()} className="font-semibold text-blue-600 underline">
            Wróć do kolejki braków
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <i className="fa-solid fa-circle-notch animate-spin text-4xl"></i>
        <p className="mt-4 text-sm font-medium">Ładowanie szczegółów…</p>
      </div>
    );
  }

  if (err || !task) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
        <div className="rounded-full bg-red-100 p-4 text-red-600">
          <i className="fa-solid fa-triangle-exclamation text-3xl"></i>
        </div>
        <p className="text-center font-medium text-slate-700">{err ?? "Wystąpił błąd"}</p>
        <Link to={WMS_ROUTES.braki()} className="mt-2 font-semibold text-blue-600 underline">
          Wróć do kolejki braków
        </Link>
      </div>
    );
  }

  return (
    <WmsOrderIssueDetailContent
      task={task}
      warehouseId={warehouseId}
      onReload={load}
      onArchiveError={setErr}
    />
  );
}
