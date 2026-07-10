import { memo } from "react";
import type { PurchasingAlertSummary } from "../../../api/purchasingAlertsApi";
import { purchasingBtnSecondary } from "../../../modules/purchasing/ui";

export type PlanAlertQuickFilter = "" | "critical" | "with_alerts";

type Props = {
  summary: PurchasingAlertSummary | null;
  quickFilter: PlanAlertQuickFilter;
  onQuickFilter: (f: PlanAlertQuickFilter) => void;
  onRunScan?: () => void;
  scanBusy?: boolean;
};

function chipClass(active: boolean): string {
  return active
    ? "rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-900 ring-1 ring-orange-200"
    : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200/80";
}

function PlanAlertStripInner({ summary, quickFilter, onQuickFilter, onRunScan, scanBusy }: Props) {
  const open = summary?.open_alerts ?? 0;
  const critical = summary?.critical_open ?? 0;
  const drafts = summary?.draft_orders_waiting ?? 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span>
          Alerty otwarte: <strong className="tabular-nums text-slate-900">{open}</strong>
        </span>
        <span>
          Krytyczne: <strong className="tabular-nums text-red-700">{critical}</strong>
        </span>
        {drafts > 0 ? (
          <span>
            Szkice PO: <strong className="tabular-nums text-slate-900">{drafts}</strong>
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={chipClass(quickFilter === "critical")} onClick={() => onQuickFilter(quickFilter === "critical" ? "" : "critical")}>
          Tylko krytyczne w planie
        </button>
        <button type="button" className={chipClass(quickFilter === "with_alerts")} onClick={() => onQuickFilter(quickFilter === "with_alerts" ? "" : "with_alerts")}>
          Produkty z alertem
        </button>
        {onRunScan ? (
          <button type="button" disabled={scanBusy} onClick={onRunScan} className={purchasingBtnSecondary}>
            {scanBusy ? "Skan…" : "Uruchom skan"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export const PlanAlertStrip = memo(PlanAlertStripInner);
