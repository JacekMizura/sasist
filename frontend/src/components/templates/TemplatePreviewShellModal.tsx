import type { ReactNode } from "react";

import { AppOverlayPortal } from "../overlay";

type Props = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Tailwind max-width class; default matches label preview. */
  maxWidthClassName?: string;
};

/**
 * Shared chrome for visual template previews (labels + print documents).
 * „Podgląd” always means a rendered document — never usages / navigation.
 */
export function TemplatePreviewShellModal({
  title,
  subtitle,
  onClose,
  children,
  maxWidthClassName = "max-w-3xl",
}: Props) {
  return (
    <AppOverlayPortal>
      <div
        className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/35 p-4"
        onClick={onClose}
      >
        <div
          className={`w-full overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-xl ${maxWidthClassName}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
              {subtitle ? <p className="truncate text-xs text-slate-500">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Zamknij
            </button>
          </div>
          <div className="flex items-center justify-center bg-white p-4">{children}</div>
        </div>
      </div>
    </AppOverlayPortal>
  );
}
