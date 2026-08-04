/**
 * Decyzja zmiany — zwarta sekcja robocza (jak WorkSection w Produkcji).
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { Card, MetricCard, typography } from "@/design-system";
import { brandPrimaryButtonClass, brandLinkTextClass } from "../../design-system/brandUi";
import type { WarehouseOperationsSummary } from "../../api/warehouseOperationsApi";
import { ShiftReturnBanner } from "../wms/supply-flow/components/ShiftReturnBanner";
import {
  consumeReturnContext,
  markLeavingForWork,
  type ShiftBoardView,
  type SupplyFlowReturnContext,
} from "../wms/supply-flow/utils/shiftBoard";
import { decisionEffectLine, topBlockingAlert } from "./shiftHealth";

type Props = {
  board: ShiftBoardView;
  ops: WarehouseOperationsSummary | null;
  loading: boolean;
  error: string | null;
  hasActiveWarehouse: boolean;
  refresh: () => void | Promise<void>;
};

export function ShiftConductor({
  board,
  ops,
  loading,
  error,
  hasActiveWarehouse,
  refresh,
}: Props) {
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

  const attention = board.attention;
  const effect = decisionEffectLine(board);
  const next = board.nextAfter;
  const blocking = topBlockingAlert(board.alerts);
  const idle = ops?.idle_operators ?? 0;
  const activeOps = ops?.active_operators ?? 0;
  const queueLen = board.queue.length + (attention ? 1 : 0);

  const nextTitle = attention?.title || next?.title || "Sprawdź kolejne dostawy";
  const nextCta = attention?.ctaLabel || next?.ctaLabel || "Przejdź do przyjęcia";
  const nextHref = attention?.ctaHref || next?.ctaHref || "/wms/receiving";

  return (
    <div className="space-y-4">
      {!hasActiveWarehouse ? (
        <ActiveWarehouseRequiredBanner hint="Wybierz aktywny magazyn, aby prowadzić zmianę." />
      ) : null}

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {error}
        </div>
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
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard density="comfortable" label="Wolni operatorzy" value={idle} />
        <MetricCard density="comfortable" label="Aktywni operatorzy" value={activeOps} />
        <MetricCard density="comfortable" label="Dostawy w kolejce" value={queueLen} />
      </div>

      <Card variant="section" density="comfortable" className="min-w-0 space-y-3">
        <h2 className={typography.h2}>Decyzja teraz</h2>

        {attention ? (
          <>
            <p className={typography.bodyStrong}>{attention.title}</p>
            {effect ? (
              <p className={typography.bodyMuted}>
                <span className={typography.bodyStrong}>Efekt: </span>
                {effect}
              </p>
            ) : null}
            {attention.blockedReason ? (
              <p className="text-sm font-semibold text-amber-900">
                Blokada: {attention.blockedReason}
              </p>
            ) : null}
            {blocking && blocking.title !== attention.title ? (
              <p className="text-sm text-rose-800">
                {blocking.title}
                {blocking.detail ? ` — ${blocking.detail}` : ""}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                to={attention.ctaHref}
                onClick={() =>
                  markLeavingForWork({
                    leftAt: Date.now(),
                    title: attention.title,
                    deliveryId: attention.deliveryId,
                  })
                }
                className={`${brandPrimaryButtonClass} gap-1.5`}
              >
                {attention.ctaLabel}
                <ArrowRight size={14} strokeWidth={2.5} />
              </Link>
              <p className={typography.caption}>
                {idle > 0
                  ? `Zleć na hali — ${idle} ${idle === 1 ? "wolny operator" : "wolnych operatorów"}.`
                  : activeOps > 0
                    ? `Na hali: ${activeOps} ${activeOps === 1 ? "operator aktywny" : "operatorów aktywnych"}.`
                    : "Wykonanie na hali (WMS)."}
              </p>
            </div>
            {next && next.title !== attention.title ? (
              <p className={`border-t border-slate-100 pt-3 ${typography.bodyMuted}`}>
                <span className={typography.bodyStrong}>Potem: </span>
                {next.title}
              </p>
            ) : null}
          </>
        ) : null}

        {!attention && !loading && board.emptyGuide ? (
          <>
            <p className={typography.bodyStrong}>{board.emptyGuide.title}</p>
            <p className={typography.bodyMuted}>{board.emptyGuide.detail}</p>
            <Link to={board.emptyGuide.ctaHref} className={`${brandPrimaryButtonClass} gap-1.5`}>
              {board.emptyGuide.ctaLabel}
              <ArrowRight size={14} strokeWidth={2.5} />
            </Link>
          </>
        ) : null}

        {!attention && !board.emptyGuide && !loading && hasActiveWarehouse && !error ? (
          <>
            <p className={typography.bodyStrong}>Nic nie wymaga Twojej decyzji</p>
            <p className={typography.bodyMuted}>
              Magazyn pracuje — wróć, gdy pojawi się dostawa albo blokada.
            </p>
            {next ? (
              <p className={typography.body}>
                <span className={typography.bodyStrong}>Gdy wrócisz: </span>
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
                  className={brandLinkTextClass}
                >
                  {next.ctaLabel}
                </Link>
              </p>
            ) : null}
          </>
        ) : null}

        {loading && !attention && !board.emptyGuide ? (
          <p className={typography.bodyMuted}>Ładowanie decyzji…</p>
        ) : null}
      </Card>
    </div>
  );
}
