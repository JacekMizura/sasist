export type PanelBulkStatusConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  /** Dodatkowy akapit (np. informacja o archiwizacji). */
  subMessage?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  /** ``danger`` — czerwony przycisk potwierdzenia (usuwanie). */
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
};

export function PanelBulkStatusConfirmModal({
  open,
  title,
  message,
  subMessage,
  confirmLabel = "Potwierdź",
  cancelLabel = "Anuluj",
  busy = false,
  variant = "default",
  onConfirm,
  onCancel,
}: PanelBulkStatusConfirmModalProps) {
  if (!open) return null;
  const confirmClass =
    variant === "danger"
      ? "rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
      : "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50";
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        {subMessage ? <p className="mt-2 text-sm text-slate-500">{subMessage}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button type="button" disabled={busy} className={confirmClass} onClick={onConfirm}>
            {busy ? "Zapisywanie…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
