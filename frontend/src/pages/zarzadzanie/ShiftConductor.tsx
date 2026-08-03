/**
 * Przebieg zmiany kierownika — jeden narracyjny tok pracy, nie dashboard.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw } from "lucide-react";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import type { WarehouseOperationsSummary } from "../../api/warehouseOperationsApi";
import { ShiftReturnBanner } from "../wms/supply-flow/components/ShiftReturnBanner";
import {
  consumeReturnContext,
  markLeavingForWork,
  type ShiftBoardView,
  type SupplyFlowReturnContext,
} from "../wms/supply-flow/utils/shiftBoard";
import {
  decisionEffectLine,
  resolveShiftHealth,
  shiftHealthLabel,
  topBlockingAlert,
} from "./shiftHealth";

type Props = {
  board: ShiftBoardView;
  ops: WarehouseOperationsSummary | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  hasActiveWarehouse: boolean;
  refresh: () => void | Promise<void>;
};

export function ShiftConductor({
  board,
  ops,
  loading,
  refreshing,
  error,
  hasActiveWarehouse,
  refresh,
}: Props) {
  const [returnCtx, setReturnCtx] = useState<SupplyFlowReturnContext | null>(null);
  const [showReturn, setShowReturn] = useState(false);
  const [showContext, setShowContext] = useState(false);

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

  const health = resolveShiftHealth(board, ops);
  const healthLabel = shiftHealthLabel(health);
  const attention = board.attention;
  const effect = decisionEffectLine(board);
  const next = board.nextAfter;
  const blocking = topBlockingAlert(board.alerts);
  const idle = ops?.idle_operators ?? 0;
  const activeOps = ops?.active_operators ?? 0;

  const nextTitle = attention?.title || next?.title || "Sprawdź kolejne dostawy";
  const nextCta = attention?.ctaLabel || next?.ctaLabel || "Przejdź do przyjęcia";
  const nextHref = attention?.ctaHref || next?.ctaHref || "/wms/receiving";

  const healthTone =
    health === "critical"
      ? "text-rose-800"
      : health === "decision"
        ? "text-amber-800"
        : "text-emerald-800";
  const healthDot =
    health === "critical"
      ? "bg-rose-500"
      : health === "decision"
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className="mx-auto min-w-0 max-w-2xl">
      {/* 1. Status zmiany — jeden wiersz, zero KPI */}
      <div className="flex items-center justify-between gap-3 pb-4">
        <p className={`inline-flex items-center gap-2 text-sm font-semibold ${healthTone}`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${healthDot}`} aria-hidden />
          {loading && !board.hasPlan && !board.emptyGuide ? "Sprawdzam stan zmiany…" : healthLabel}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing || loading || !hasActiveWarehouse}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-40"
          aria-label="Odśwież stan zmiany"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          Odśwież
        </button>
      </div>

      {!hasActiveWarehouse ? (
        <ActiveWarehouseRequiredBanner hint="Wybierz aktywny magazyn, aby prowadzić zmianę." />
      ) : null}

      {error ? (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {error}
        </p>
      ) : null}

      {showReturn && returnCtx ? (
        <ShiftReturnBanner
          completedTitle={returnCtx.title}
          nextTitle={nextTitle}
          ctaLabel={nextCta}
          ctaHref={nextHref}
          onDismiss={() => {
            setShowReturn(false);
            setReturnCtx(null);
          }}
        />
      ) : (
        <div className="space-y-5">
          {/* 2–4. Decyzja → efekt → wykonaj (jeden blok narracji) */}
          {attention ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
                Twoja decyzja teraz
              </p>
              <h1 className="mt-1 text-2xl font-black leading-tight tracking-tight text-slate-900 sm:text-3xl">
                {attention.title}
              </h1>

              {effect ? (
                <p className="mt-3 text-base text-slate-600">
                  <span className="font-semibold text-slate-800">Efekt: </span>
                  {effect}
                </p>
              ) : null}

              {attention.blockedReason ? (
                <p className="mt-3 text-sm font-semibold text-amber-900">
                  Blokada: {attention.blockedReason}
                </p>
              ) : null}

              {blocking && blocking.title !== attention.title ? (
                <p className="mt-2 text-sm text-rose-800">
                  {blocking.title}
                  {blocking.detail ? ` — ${blocking.detail}` : ""}
                </p>
              ) : null}

              <div className="mt-5 space-y-2">
                <Link
                  to={attention.ctaHref}
                  onClick={() =>
                    markLeavingForWork({
                      leftAt: Date.now(),
                      title: attention.title,
                      deliveryId: attention.deliveryId,
                    })
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3.5 text-base font-black text-white hover:bg-orange-600 sm:w-auto"
                >
                  {attention.ctaLabel}
                  <ArrowRight size={18} strokeWidth={2.5} />
                </Link>
                <p className="text-xs text-slate-500">
                  {idle > 0
                    ? `Zleć na hali — masz ${idle} ${idle === 1 ? "wolnego operatora" : "wolnych operatorów"}.`
                    : activeOps > 0
                      ? `Wykonanie na hali — ${activeOps} ${activeOps === 1 ? "operator aktywny" : "operatorów aktywnych"}.`
                      : "Wykonanie odbywa się na hali (WMS)."}
                </p>
              </div>
            </div>
          ) : null}

          {!attention && !loading && board.emptyGuide ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Twoja decyzja teraz
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                {board.emptyGuide.title}
              </h1>
              <p className="mt-3 text-base text-slate-600">{board.emptyGuide.detail}</p>
              <Link
                to={board.emptyGuide.ctaHref}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3.5 text-base font-black text-white hover:bg-orange-600"
              >
                {board.emptyGuide.ctaLabel}
                <ArrowRight size={18} strokeWidth={2.5} />
              </Link>
            </div>
          ) : null}

          {!attention && !board.emptyGuide && !loading && hasActiveWarehouse && !error ? (
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                Nic nie wymaga Twojej decyzji
              </h1>
              <p className="mt-2 text-base text-slate-600">
                Magazyn pracuje — wróć, gdy pojawi się dostawa albo blokada.
              </p>
            </div>
          ) : null}

          {/* 5. Co będzie następne */}
          {attention && next && next.title !== attention.title ? (
            <p className="border-t border-slate-100 pt-4 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">Potem: </span>
              {next.title}
            </p>
          ) : null}

          {!attention && next ? (
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-800">Gdy wrócisz: </span>
              {next.title}
              {" · "}
              <Link
                to={next.ctaHref}
                onClick={() =>
                  markLeavingForWork({
                    leftAt: Date.now(),
                    title: next.title,
                    deliveryId: null,
                  })
                }
                className="font-semibold text-orange-700 hover:underline"
              >
                {next.ctaLabel}
              </Link>
            </p>
          ) : null}
        </div>
      )}

      {/* 6. Kontekst — schowany, nie konkuruje z decyzją */}
      <div className="mt-10 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => setShowContext((v) => !v)}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          {showContext ? "Ukryj kontekst zmiany" : "Pokaż kontekst zmiany"}
        </button>

        {showContext ? (
          <div className="mt-3 space-y-3 text-sm text-slate-600">
            <p>
              Na rampie {board.warehouseState.onRamp}
              {" · "}
              Do rozlokowania{" "}
              {board.warehouseState.awaitingPutaway || ops?.products_waiting_putaway || 0}
              {" · "}
              Kompletacja {ops?.picking ?? 0}
              {" · "}
              Problemy {(ops?.blocked_orders ?? 0) + (ops?.shortages ?? 0)}
            </p>
            {board.alerts.slice(0, 2).map((a, i) => (
              <p key={`${a.title}-${i}`}>
                {a.severity === "critical" ? "Krytyczne: " : "Uwaga: "}
                {a.title}
                {a.ctaHref ? (
                  <>
                    {" — "}
                    <Link to={a.ctaHref} className="font-semibold text-orange-700 hover:underline">
                      {a.ctaLabel}
                    </Link>
                  </>
                ) : null}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
