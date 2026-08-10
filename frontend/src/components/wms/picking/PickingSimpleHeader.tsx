import type { ReactNode } from "react";
import { wmsTypoClass } from "../../../wms/typography/wmsOperatorTypography";

function IconBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

/**
 * Minimal picking header: ← + plain title (Sellasist-clean, white).
 */
export function PickingSimpleHeader({
  onBack,
  backAriaLabel,
  title,
  subtitle,
}: {
  onBack: () => void;
  backAriaLabel: string;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header className="shrink-0 border-b border-slate-100 bg-white">
      <div className="flex w-full max-w-5xl items-start gap-3 px-4 py-3 sm:px-5">
        <button
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-50"
          onClick={onBack}
          aria-label={backAriaLabel}
        >
          <IconBack />
        </button>
        <div className="min-w-0 flex-1 pt-1.5">
          {subtitle ? <p className="mb-0.5 text-xs text-slate-400">{subtitle}</p> : null}
          <div className={["min-w-0 break-words font-semibold text-slate-900", wmsTypoClass.base].join(" ")}>
            {title}
          </div>
        </div>
      </div>
    </header>
  );
}
