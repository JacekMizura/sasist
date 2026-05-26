import type { ReactNode } from "react";
import type { PanelConfigurableUiStatusBrief } from "../../utils/panelListStatusBriefMappers";
import { OrderUiStatusConfigRowPresent } from "../orders/orderList/OrderUiStatusConfigRowPresent";

/**
 * Order detail header rhythm: title + meta (left), actions (right), then shared status chip row.
 * Layout/styling only — slots carry existing page actions / controls.
 */
export function PanelDetailEntityHeader({
  title,
  meta,
  status,
  actions,
  belowTitle,
  /** Tighter vertical rhythm (e.g. complaint detail aligned with Order detail density). */
  compact,
}: {
  title: ReactNode;
  meta: ReactNode;
  /** Panel / process status — same rich chip as Orders (`OrderUiStatusConfigRowPresent`). */
  status: PanelConfigurableUiStatusBrief | null;
  actions?: ReactNode;
  /** Extra controls under status (e.g. Order panel dropdown, RMZ panel `<select>`). */
  belowTitle?: ReactNode;
  compact?: boolean;
}) {
  const gap = compact ? "space-y-2" : "space-y-3";
  const statusMt = compact ? "mt-2" : "mt-3";
  return (
    <div className={`min-w-0 ${gap}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-snug tracking-tight text-slate-900 sm:text-xl">{title}</h1>
          <div className="mt-1.5 text-xs">{meta}</div>
          <div className={statusMt}>
            <OrderUiStatusConfigRowPresent variant="compact" status={status} />
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">{actions}</div>
        ) : null}
      </div>
      {belowTitle ? <div className="min-w-0">{belowTitle}</div> : null}
    </div>
  );
}
