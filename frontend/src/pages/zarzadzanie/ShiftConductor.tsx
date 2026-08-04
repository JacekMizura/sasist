/**
 * Przebieg zmiany kierownika — ekran pracy SASIST (karty / sekcje), nie dokument.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw } from "lucide-react";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card, SecondaryButton, StatusBadge, typography } from "@/design-system";
import { brandPrimaryButtonClass, brandLinkTextClass } from "../../design-system/brandUi";
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

function healthTone(health: ReturnType<typeof resolveShiftHealth>): "danger" | "warning" | "success" {
  if (health === "critical") return "danger";
  if (health === "decision") return "warning";
  return "success";
}

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

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Pulpit kierownika"
        subtitle="Co zrobić teraz na zmianie — decyzja, efekt, zlecenie na halę."
        breadcrumbs={[{ label: "Magazyn", to: "/zarzadzanie-magazynem/pulpit" }, { label: "Pulpit kierownika" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={healthTone(health)} density="compact">
              {loading && !board.hasPlan && !board.emptyGuide ? "Sprawdzam…" : healthLabel}
            </StatusBadge>
            <SecondaryButton
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing || loading || !hasActiveWarehouse}
              aria-label="Odśwież stan zmiany"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              Odśwież
            </SecondaryButton>
          </div>
        }
      />

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
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card variant="section" density="comfortable" className="min-w-0 space-y-3">
            <p className={typography.section}>Twoja decyzja teraz</p>

            {attention ? (
              <>
                <h2 className={typography.h2}>{attention.title}</h2>
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
                <div className="space-y-2 pt-1">
                  <Link
                    to={attention.ctaHref}
                    onClick={() =>
                      markLeavingForWork({
                        leftAt: Date.now(),
                        title: attention.title,
                        deliveryId: attention.deliveryId,
                      })
                    }
                    className={`${brandPrimaryButtonClass} gap-2`}
                  >
                    {attention.ctaLabel}
                    <ArrowRight size={16} strokeWidth={2.5} />
                  </Link>
                  <p className={typography.caption}>
                    {idle > 0
                      ? `Zleć na hali — masz ${idle} ${idle === 1 ? "wolnego operatora" : "wolnych operatorów"}.`
                      : activeOps > 0
                        ? `Wykonanie na hali — ${activeOps} ${activeOps === 1 ? "operator aktywny" : "operatorów aktywnych"}.`
                        : "Wykonanie odbywa się na hali (WMS)."}
                  </p>
                </div>
              </>
            ) : null}

            {!attention && !loading && board.emptyGuide ? (
              <>
                <h2 className={typography.h2}>{board.emptyGuide.title}</h2>
                <p className={typography.bodyMuted}>{board.emptyGuide.detail}</p>
                <Link to={board.emptyGuide.ctaHref} className={`${brandPrimaryButtonClass} gap-2`}>
                  {board.emptyGuide.ctaLabel}
                  <ArrowRight size={16} strokeWidth={2.5} />
                </Link>
              </>
            ) : null}

            {!attention && !board.emptyGuide && !loading && hasActiveWarehouse && !error ? (
              <>
                <h2 className={typography.h2}>Nic nie wymaga Twojej decyzji</h2>
                <p className={typography.bodyMuted}>
                  Magazyn pracuje — wróć, gdy pojawi się dostawa albo blokada.
                </p>
              </>
            ) : null}

            {loading && !attention && !board.emptyGuide ? (
              <p className={typography.bodyMuted}>Ładowanie decyzji…</p>
            ) : null}
          </Card>

          <Card variant="section" density="comfortable" className="min-w-0 space-y-3">
            <p className={typography.section}>Potem / obsada</p>
            {attention && next && next.title !== attention.title ? (
              <p className={typography.body}>
                <span className={typography.bodyStrong}>Następne: </span>
                {next.title}
              </p>
            ) : null}
            {!attention && next ? (
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
            {!next || (attention && next.title === attention.title) ? (
              <p className={typography.bodyMuted}>Brak kolejnej pozycji w planie zmiany.</p>
            ) : null}
            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <div>
                <p className={typography.kpiLabel}>Wolni operatorzy</p>
                <p className={typography.metric}>{idle}</p>
              </div>
              <div>
                <p className={typography.kpiLabel}>Aktywni operatorzy</p>
                <p className={typography.metric}>{activeOps}</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
