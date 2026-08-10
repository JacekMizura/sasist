import type { ReactNode } from "react";
import { wmsTypoClass } from "../../../wms/typography/wmsOperatorTypography";
import { PICKING_PAGE_PAD_X } from "./pickingUiTokens";

function IconBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

/**
 * Full-width picking header (Sasist): ← + title/subtitle + optional trailing (np. badge wózka).
 */
export function PickingSimpleHeader({
  onBack,
  backAriaLabel,
  title,
  subtitle,
  trailing,
}: {
  onBack: () => void;
  backAriaLabel: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right side of the title row (e.g. cart badge). */
  trailing?: ReactNode;
}) {
  return (
    <header className="shrink-0 border-b border-slate-100 bg-white">
      <div className={["flex w-full items-start gap-3 py-3", PICKING_PAGE_PAD_X].join(" ")}>
        <button
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-50"
          onClick={onBack}
          aria-label={backAriaLabel}
        >
          <IconBack />
        </button>
        <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-1">
          <div className="min-w-0 flex-1">
            {subtitle ? <div className="mb-0.5 text-xs text-slate-500">{subtitle}</div> : null}
            <div className={["min-w-0 break-words font-bold text-slate-900", wmsTypoClass.base].join(" ")}>
              {title}
            </div>
          </div>
          {trailing ? <div className="shrink-0 pt-0.5">{trailing}</div> : null}
        </div>
      </div>
    </header>
  );
}

/** Meta row under header: Wózek badge + Do zebrania — same baseline, full width. */
export function PickingSessionMetaBar({
  toCollectLabel,
  cartBadge,
}: {
  toCollectLabel: ReactNode;
  cartBadge?: ReactNode;
}) {
  return (
    <div
      className={[
        "flex w-full flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 bg-white py-2.5",
        PICKING_PAGE_PAD_X,
      ].join(" ")}
    >
      {cartBadge ? <div className="shrink-0">{cartBadge}</div> : null}
      <p className={["min-w-0 font-semibold text-slate-800", wmsTypoClass.base].join(" ")}>
        {toCollectLabel}
      </p>
    </div>
  );
}
