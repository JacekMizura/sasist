import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  busy?: boolean;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  aside?: ReactNode;
};

export function ReturnsConfiguratorModalShell({
  open,
  title,
  subtitle,
  busy = false,
  wide = false,
  onClose,
  children,
  footer,
  aside,
}: Props) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className={`flex max-h-[min(92vh,880px)] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ${wide ? "max-w-4xl" : "max-w-lg"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="returns-configurator-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="returns-configurator-modal-title" className="text-lg font-bold text-slate-900">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            onClick={onClose}
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${aside ? "grid lg:grid-cols-[1fr_240px]" : ""}`}>
          <div className="px-5 py-4">{children}</div>
          {aside ? <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-4 lg:border-l lg:border-t-0">{aside}</div> : null}
        </div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
