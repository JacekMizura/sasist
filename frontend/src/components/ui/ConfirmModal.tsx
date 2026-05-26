import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface ConfirmModalProps {
  title: ReactNode;
  message: ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /** When true: backdrop/cancel disabled, confirm shows "Trwa…". */
  pending?: boolean;
  /** Label for the confirm button (default: Tak). */
  confirmLabel?: string;
  confirmTone?: "danger" | "default";
  maxWidthClassName?: string;
}

export function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
  pending = false,
  confirmLabel = "Tak",
  confirmTone = "danger",
  maxWidthClassName = "max-w-xl",
}: ConfirmModalProps) {
  const titleId = useId();
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.setAttribute("data-modal-open", "true");
    return () => {
      document.body.removeAttribute("data-modal-open");
    };
  }, []);

  const modal = (
    <div
      className="confirm-modal-layer fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-[3px]"
      role="presentation"
      onClick={() => {
        if (!pending) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-[510] w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl ${maxWidthClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 id={titleId} className="text-lg font-semibold text-slate-900">
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 text-sm text-slate-700">{message}</div>
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={pending}
            onClick={onCancel}
          >
            Anuluj
          </button>
          <button
            type="button"
            className={`h-10 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50 ${
              confirmTone === "danger" ? "bg-red-600 hover:bg-red-500" : "bg-slate-900 hover:bg-slate-800"
            }`}
            disabled={pending}
            onClick={() => void onConfirm()}
          >
            {pending ? "Trwa…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
