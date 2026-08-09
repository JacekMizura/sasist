import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { WmsPackingOrderDetailApi } from "../../../api/wmsPackingApi";
import { getWmsPackingSettings } from "../../../api/wmsPackingSettingsApi";
import type { WmsPackingAutoActions } from "../../../types/wmsPackingSettings";
import { DAMAGE_TENANT_ID } from "../../../pages/damage/damageShared";
import type { PackingFinishRunResult } from "./usePackingOrderController";
import { AutoActionsShell } from "./postComplete/AutoActionsShell";
import {
  buildAutoActionDisplaySteps,
  enabledAutoActionMetas,
} from "./postComplete/autoActionsModel";

export type PackingFinalizationViewProps = {
  detail: WmsPackingOrderDetailApi;
  warehouseId: number | null;
  runPostPackFinish: () => Promise<PackingFinishRunResult>;
  postPackFinishBusy: boolean;
  onBackToOrder: () => void;
  onBackToOrders: () => void;
};

/**
 * Krok 3: wyłącznie tutaj uruchamiany jest POST …/finish (dokument, etykieta, status).
 * UI = ten sam szkielet co „Akcje automatyczne”; animacja kroków odzwierciedla przebieg finish.
 */
export function PackingFinalizationView({
  detail,
  warehouseId,
  runPostPackFinish,
  postPackFinishBusy,
  onBackToOrder,
  onBackToOrders,
}: PackingFinalizationViewProps) {
  const [runId, setRunId] = useState(0);
  const [failed, setFailed] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [autoActions, setAutoActions] = useState<WmsPackingAutoActions | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof window.setInterval> | undefined>(undefined);

  useEffect(() => {
    if (warehouseId == null || warehouseId < 1) return;
    let cancelledLoad = false;
    void getWmsPackingSettings(DAMAGE_TENANT_ID, warehouseId)
      .then((s) => {
        if (!cancelledLoad) setAutoActions(s.auto_actions);
      })
      .catch(() => {
        if (!cancelledLoad) setAutoActions(null);
      });
    return () => {
      cancelledLoad = true;
    };
  }, [warehouseId]);

  const enabledCount = useMemo(() => enabledAutoActionMetas(autoActions).length, [autoActions]);

  useEffect(() => {
    let cancelledRun = false;
    setFailed(false);
    setCancelled(false);
    setActiveStep(0);
    if (stepTimerRef.current !== undefined) {
      window.clearInterval(stepTimerRef.current);
      stepTimerRef.current = undefined;
    }
    const maxIdx = Math.max(0, enabledCount - 1);
    if (enabledCount > 0) {
      stepTimerRef.current = window.setInterval(() => {
        setActiveStep((s) => (s < maxIdx ? s + 1 : s));
      }, 1100);
    }

    void (async () => {
      const result = await runPostPackFinish();
      if (stepTimerRef.current !== undefined) {
        window.clearInterval(stepTimerRef.current);
        stepTimerRef.current = undefined;
      }
      if (cancelledRun) return;
      if (result === "ok") setActiveStep(Math.max(enabledCount, 1));
      else if (result === "cancelled") setCancelled(true);
      else setFailed(true);
    })();

    return () => {
      cancelledRun = true;
      if (stepTimerRef.current !== undefined) {
        window.clearInterval(stepTimerRef.current);
        stepTimerRef.current = undefined;
      }
    };
  }, [runId, runPostPackFinish, enabledCount]);

  const steps = buildAutoActionDisplaySteps({
    detail,
    autoActions,
    runningIndex: failed || cancelled ? activeStep : postPackFinishBusy ? activeStep : null,
    finishFailed: failed,
  });

  // Błąd finish: komunikat idzie jako czerwony toast/popup WMS (controller) —
  // nie zastępujemy panelu finalizacji wielkim czerwonym tekstem.
  let footerMessage: string | null = null;
  if (cancelled) {
    footerMessage = "Anulowano generowanie listu przewozowego. Możesz ponowić finalizację, gdy będziesz gotowy.";
  }

  const footerExtra =
    cancelled || failed ? (
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={() => setRunId((n) => n + 1)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Ponów finalizację
        </button>
      </div>
    ) : null;

  return (
    <AutoActionsShell
      detail={detail}
      steps={steps}
      onBackToOrders={onBackToOrders}
      onBackToOrder={onBackToOrder}
      footerMessage={footerMessage}
      footerTone="default"
      footerExtra={footerExtra}
    />
  );
}
