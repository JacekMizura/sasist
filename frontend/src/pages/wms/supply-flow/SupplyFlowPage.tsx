import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { ActiveWarehouseRequiredBanner } from "../../../components/layout/ActiveWarehouseRequiredBanner";
import { useActiveWarehouseContext } from "../../../hooks/useActiveWarehouseContext";
import { ShiftAlerts } from "./components/ShiftAlerts";
import { ShiftAttentionCard } from "./components/ShiftAttentionCard";
import { ShiftNextAfter } from "./components/ShiftNextAfter";
import { ShiftQueue } from "./components/ShiftQueue";
import { ShiftReturnBanner } from "./components/ShiftReturnBanner";
import { ShiftWarehouseState } from "./components/ShiftWarehouseState";
import { useSupplyFlowPlan } from "./hooks/useSupplyFlowPlan";
import {
  consumeReturnContext,
  type SupplyFlowReturnContext,
} from "./utils/shiftBoard";

export default function SupplyFlowPage() {
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
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Przepływ dostaw</h1>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing || loading || !hasActiveWarehouse}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Odświeżanie…" : "Odśwież"}
        </button>
      </header>

      {!hasActiveWarehouse ? (
        <ActiveWarehouseRequiredBanner hint="Wybierz aktywny magazyn, aby zobaczyć kolejkę dostaw." />
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      {loading && !board.hasPlan && !board.emptyGuide ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Ładowanie…
        </div>
      ) : null}

      {/* ——— Pierwszy viewport: alert + jedna decyzja + CTA ——— */}
      <div className="min-h-[calc(100dvh-7.5rem)] space-y-4">
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
              <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-3">
                <p className="text-sm font-bold text-slate-800">{board.emptyGuide.title}</p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">{board.emptyGuide.detail}</p>
                <Link
                  to={board.emptyGuide.ctaHref}
                  className="inline-flex items-center justify-center rounded-xl bg-orange-500 text-white px-4 py-2.5 text-xs font-black"
                >
                  {board.emptyGuide.ctaLabel}
                </Link>
              </section>
            ) : null}
          </>
        )}
      </div>

      {/* ——— Poniżej pierwszego viewportu ——— */}
      {board.hasPlan && !showReturn ? (
        <div className="space-y-4">
          <ShiftNextAfter nextAfter={board.nextAfter} steps={board.workPlan} />
          <ShiftQueue items={board.queue} remainingAfterQueue={board.remainingAfterQueue} />
          <ShiftWarehouseState state={board.warehouseState} />
        </div>
      ) : null}

      {board.hasPlan && showReturn ? (
        <div className="pt-2">
          <ShiftWarehouseState state={board.warehouseState} />
        </div>
      ) : null}
    </div>
  );
}
