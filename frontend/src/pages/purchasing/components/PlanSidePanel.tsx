import { X } from "lucide-react";
import type { ReactNode } from "react";

type PlanSidePanelProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
};

export function PlanSidePanel({ title, subtitle, onClose, children }: PlanSidePanelProps) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Zamknij panel"
        onClick={onClose}
      />
      <aside
        className="relative flex h-full w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 md:px-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}
