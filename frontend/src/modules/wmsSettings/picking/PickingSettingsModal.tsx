import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Large centered modal for picking mode create/edit (Sellasist-style configurator).
 * Presentation only — save/cancel remain on the global WMS settings footer.
 */
export function PickingSettingsModal({ open, title, subtitle, onClose, children }: Props) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45"
        aria-label="Zamknij"
        onClick={onClose}
      />
      <div className="relative flex max-h-[min(92vh,920px)] w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">{children}</div>
        <footer className="shrink-0 border-t border-slate-100 bg-slate-50 px-5 py-2.5 text-xs text-slate-500 sm:px-6">
          Zapisz lub anuluj zmiany pasekiem na dole strony ustawień WMS.
        </footer>
      </div>
    </div>,
    document.body,
  );
}
