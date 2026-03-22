import { useId, type ReactNode } from "react";

export interface ConfirmModalProps {
  title: string;
  message: ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /** When true: backdrop/cancel disabled, confirm shows "Trwa…". */
  pending?: boolean;
}

/**
 * Reusable confirmation overlay (dark theme). Buttons: Tak / Anuluj.
 */
export function ConfirmModal({ title, message, onConfirm, onCancel, pending = false }: ConfirmModalProps) {
  const titleId = useId();

  return (
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={() => {
        if (!pending) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-w-sm w-full rounded-xl border border-slate-600 bg-slate-800 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="text-sm font-semibold text-slate-100">
          {title}
        </h3>
        <div className="mt-3 text-sm text-slate-300">{message}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            disabled={pending}
            onClick={onCancel}
          >
            Anuluj
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
            disabled={pending}
            onClick={() => void onConfirm()}
          >
            {pending ? "Trwa…" : "Tak"}
          </button>
        </div>
      </div>
    </div>
  );
}
