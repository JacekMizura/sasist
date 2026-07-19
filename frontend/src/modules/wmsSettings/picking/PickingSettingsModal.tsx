import { createPortal } from "react-dom";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  children: ReactNode;
  /** Show “Masz niezapisane zmiany” in the modal footer. */
  dirty?: boolean;
  saving?: boolean;
  saveError?: string | null;
};

/**
 * Self-contained picking mode create/edit modal.
 * Footer Zapisz/Anuluj commit or discard the modal draft only — page-level
 * WMS sticky bar remains responsible for API persistence of the configs list.
 */
export function PickingSettingsModal({
  open,
  title,
  subtitle,
  onClose,
  onSave,
  children,
  dirty = false,
  saving = false,
  saveError = null,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!saving) onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, saving]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 z-0 bg-slate-900/50"
        aria-label="Zamknij"
        disabled={saving}
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <div
        className="relative z-10 flex max-h-[min(88vh,820px)] w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-3.5 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!saving) onClose();
            }}
            disabled={saving}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">{children}</div>

        <footer className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 sm:px-6">
          <div className="min-w-0 text-sm">
            {saveError ? (
              <p className="font-medium text-red-700" role="alert">
                {saveError}
              </p>
            ) : dirty ? (
              <p className="font-medium text-amber-700">Masz niezapisane zmiany</p>
            ) : (
              <p className="text-slate-500">Brak niezapisanych zmian w tej regule</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              disabled={saving}
              onClick={onClose}
            >
              Anuluj
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              disabled={saving}
              onClick={() => void onSave()}
            >
              {saving ? "Zapisywanie…" : "Zapisz"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
