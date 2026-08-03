/**
 * Sekcja „Decyzje” w Pulpicie kierownika.
 * Konsumuje API silnika (backend) — bez nazwy silnika w UI.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { ShiftAlerts } from "../wms/supply-flow/components/ShiftAlerts";
import { ShiftAttentionCard } from "../wms/supply-flow/components/ShiftAttentionCard";
import { ShiftNextAfter } from "../wms/supply-flow/components/ShiftNextAfter";
import { ShiftQueue } from "../wms/supply-flow/components/ShiftQueue";
import { ShiftReturnBanner } from "../wms/supply-flow/components/ShiftReturnBanner";
import { useSupplyFlowPlan } from "../wms/supply-flow/hooks/useSupplyFlowPlan";
import {
  consumeReturnContext,
  type SupplyFlowReturnContext,
} from "../wms/supply-flow/utils/shiftBoard";

export function ManagerDecisionsPanel() {
  const { hasActiveWarehouse, warehouseId } = useActiveWarehouseContext();
  const { board, loading, refreshing, error, refresh } = useSupplyFlowPlan(
    hasActiveWarehouse ? warehouseId : null,
  );
  const [returnCtx, setReturnCtx] = useState<SupplyFlowReturnContext | null>(null);
  const [showReturn, setShowReturn] = useState(false);

  const checkReturn = useCallback(() => {
    const ctx = consumeReturnContext();
    if (!ctx) return;
    setReturnCtx(ctx);
    setShowReturn(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    checkReturn();
  }, [checkReturn]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") checkReturn();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", checkReturn);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", checkReturn);
    };
  }, [checkReturn]);

  const nextTitle =
    board.attention?.title || board.nextAfter?.title || "Sprawdź kolejne dostawy na magazynie";
  const nextCtaLabel = board.attention?.ctaLabel || board.nextAfter?.ctaLabel || "Przejdź do przyjęcia";
  const nextCtaHref = board.attention?.ctaHref || board.nextAfter?.ctaHref || "/wms/receiving";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Co zrobić teraz, żeby magazyn ruszył — potem przejdź do wykonania na hali.
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing || loading || !hasActiveWarehouse}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Odświeżanie…" : "Odśwież"}
        </button>
      </div>

      {!hasActiveWarehouse ? (
        <ActiveWarehouseRequiredBanner hint="Wybierz aktywny magazyn, aby zobaczyć decyzje." />
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      {loading && !board.hasPlan && !board.emptyGuide ? (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center text-sm text-slate-500">
          Ładowanie…
        </div>
      ) : null}

      {showReturn && returnCtx ? (
        <ShiftReturnBanner
          completedTitle={returnCtx.title}
          nextTitle={nextTitle}
          ctaLabel={nextCtaLabel}
          ctaHref={nextCtaHref}
          onDismiss={() => {
            setShowReturn(false);
            setReturnCtx(null);
          }}
        />
      ) : (
        <>
          {board.hasPlan ? <ShiftAlerts alerts={board.alerts} /> : null}
          {board.attention ? <ShiftAttentionCard attention={board.attention} /> : null}
          {!loading && board.emptyGuide && !board.attention ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center space-y-2">
              <p className="text-sm font-bold text-slate-800">{board.emptyGuide.title}</p>
              <p className="text-xs text-slate-500">{board.emptyGuide.detail}</p>
              <Link
                to={board.emptyGuide.ctaHref}
                className="inline-flex rounded-xl bg-orange-500 text-white px-4 py-2 text-xs font-black"
              >
                {board.emptyGuide.ctaLabel}
              </Link>
            </div>
          ) : null}
        </>
      )}

      {board.hasPlan && !showReturn ? (
        <div className="space-y-3">
          <ShiftNextAfter nextAfter={board.nextAfter} steps={board.workPlan} />
          <ShiftQueue items={board.queue} remainingAfterQueue={board.remainingAfterQueue} />
        </div>
      ) : null}
    </div>
  );
}
