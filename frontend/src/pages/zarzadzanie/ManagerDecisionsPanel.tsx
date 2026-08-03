/**
 * Sekcja „Co wymaga decyzji” — max 1–2 decyzje.
 * Konsumuje istniejące API (bez nazwy silnika w UI).
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw } from "lucide-react";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { ShiftAttentionCard } from "../wms/supply-flow/components/ShiftAttentionCard";
import { ShiftReturnBanner } from "../wms/supply-flow/components/ShiftReturnBanner";
import { useSupplyFlowPlan } from "../wms/supply-flow/hooks/useSupplyFlowPlan";
import {
  consumeReturnContext,
  markLeavingForWork,
  type SupplyFlowReturnContext,
  type ShiftBoardView,
} from "../wms/supply-flow/utils/shiftBoard";

export type ManagerDecisionsPanelProps = {
  /** Gdy parent ładuje plan — reuse (unikamy podwójnego fetch). */
  board?: ShiftBoardView;
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  refresh?: () => void | Promise<void>;
  warehouseId?: number | null;
  hasActiveWarehouse?: boolean;
};

export function ManagerDecisionsPanel(props: ManagerDecisionsPanelProps = {}) {
  const ctx = useActiveWarehouseContext();
  const hasActiveWarehouse = props.hasActiveWarehouse ?? ctx.hasActiveWarehouse;
  const warehouseId = props.warehouseId ?? (ctx.hasActiveWarehouse ? ctx.warehouseId : null);
  const owned = useSupplyFlowPlan(props.board != null ? null : hasActiveWarehouse ? warehouseId : null);

  const board = props.board ?? owned.board;
  const loading = props.loading ?? owned.loading;
  const refreshing = props.refreshing ?? owned.refreshing;
  const error = props.error !== undefined ? props.error : owned.error;
  const refresh = props.refresh ?? owned.refresh;

  const [returnCtx, setReturnCtx] = useState<SupplyFlowReturnContext | null>(null);
  const [showReturn, setShowReturn] = useState(false);

  const checkReturn = useCallback(() => {
    const r = consumeReturnContext();
    if (!r) return;
    setReturnCtx(r);
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

  const primary = board.attention;
  const secondary =
    board.nextAfter &&
    (!primary || board.nextAfter.title !== primary.title)
      ? board.nextAfter
      : null;

  const fallbackTitle = secondary?.title || "Sprawdź kolejne dostawy na magazynie";
  const fallbackCta = secondary?.ctaLabel || "Przejdź do przyjęcia";
  const fallbackHref = secondary?.ctaHref || "/wms/receiving";

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing || loading || !hasActiveWarehouse}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
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
        <p className="text-sm text-slate-500">Ładowanie decyzji…</p>
      ) : null}

      {showReturn && returnCtx ? (
        <ShiftReturnBanner
          completedTitle={returnCtx.title}
          nextTitle={primary?.title || fallbackTitle}
          ctaLabel={primary?.ctaLabel || fallbackCta}
          ctaHref={primary?.ctaHref || fallbackHref}
          onDismiss={() => {
            setShowReturn(false);
            setReturnCtx(null);
          }}
        />
      ) : (
        <>
          {primary ? <ShiftAttentionCard attention={primary} /> : null}

          {!primary && !loading && board.emptyGuide ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center space-y-2">
              <p className="text-base font-bold text-slate-900">{board.emptyGuide.title}</p>
              <p className="text-sm text-slate-500">{board.emptyGuide.detail}</p>
              <Link
                to={board.emptyGuide.ctaHref}
                className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white"
              >
                {board.emptyGuide.ctaLabel}
                <ArrowRight size={16} />
              </Link>
            </div>
          ) : null}

          {!primary && !board.emptyGuide && !loading && hasActiveWarehouse && !error ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Nic nie wymaga decyzji w tej chwili.
            </p>
          ) : null}

          {/* Druga decyzja — tylko gdy jest i różni się od pierwszej */}
          {primary && secondary ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Następne</p>
                <p className="text-sm font-semibold text-slate-800 truncate">{secondary.title}</p>
              </div>
              <Link
                to={secondary.ctaHref}
                onClick={() =>
                  markLeavingForWork({
                    leftAt: Date.now(),
                    title: secondary.title,
                    deliveryId: null,
                  })
                }
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                {secondary.ctaLabel}
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
