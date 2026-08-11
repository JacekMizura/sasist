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
 * Full-width picking header (Sasist): ← + optional title + trailing.
 * `trailingFill` — trailing fills remaining width (location bar next to back).
 */
export function PickingSimpleHeader({
  onBack,
  backAriaLabel,
  title,
  subtitle,
  trailing,
  trailingFill = false,
}: {
  onBack: () => void;
  backAriaLabel: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  /** When true, trailing stretches (e.g. location bar beside ←). */
  trailingFill?: boolean;
}) {
  const hasTitle =
    title != null && title !== false && title !== "" && !(typeof title === "string" && !title.trim());

  return (
    <header className="shrink-0 border-b border-slate-100 bg-white">
      <div className={["flex w-full items-center gap-3 py-3", PICKING_PAGE_PAD_X].join(" ")}>
        <button
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-50"
          onClick={onBack}
          aria-label={backAriaLabel}
        >
          <IconBack />
        </button>
        {hasTitle || subtitle ? (
          <div className="min-w-0 flex-1">
            {subtitle ? <div className="mb-0.5 text-xs text-slate-500">{subtitle}</div> : null}
            {hasTitle ? (
              <div className={["min-w-0 break-words font-bold text-slate-900", wmsTypoClass.base].join(" ")}>
                {title}
              </div>
            ) : null}
          </div>
        ) : null}
        {trailing ? (
          <div
            className={[
              "flex min-w-0 items-center gap-3",
              trailingFill
                ? "flex-1"
                : hasTitle
                  ? "ml-auto shrink-0"
                  : "flex-1 justify-end",
            ].join(" ")}
          >
            {trailing}
          </div>
        ) : !hasTitle ? (
          <div className="min-w-0 flex-1" />
        ) : null}
      </div>
    </header>
  );
}
