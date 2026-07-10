import type { ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Wider drawer for sectional cart grids. */
  wide?: boolean;
};

/** Right-side detail drawer for fleet resources (wózki, nośniki). */
export function FleetResourceDetailDrawer({ open, title, subtitle, onClose, children, wide = false }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[280] flex justify-end bg-slate-900/30 backdrop-blur-[1px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`flex h-full w-full flex-col bg-white shadow-2xl ${wide ? "max-w-3xl" : "max-w-xl"}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            {subtitle ? (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{subtitle}</p>
            ) : null}
            <h2 className="truncate text-lg font-semibold text-slate-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">{children}</div>
      </div>
    </div>
  );
}
