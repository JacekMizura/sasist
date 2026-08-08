import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import type { WmsOperationalNoteBriefApi } from "../../../api/wmsPackingApi";

type Props = {
  open: boolean;
  notes: WmsOperationalNoteBriefApi[];
  orderNumber?: string;
  onClose: () => void;
};

/** Blokujący popup notatek operacyjnych w trybie pakowania. */
export function PackingNotesPopupModal({ open, notes, orderNumber, onClose }: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || notes.length === 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[5500] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(90vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="border-b border-red-200 bg-red-50 px-5 py-4">
          <h2 id={titleId} className="text-lg font-black text-red-900">
            Notatki do zamówienia
            {orderNumber ? (
              <span className="ml-2 font-bold tabular-nums text-red-800">{orderNumber}</span>
            ) : null}
          </h2>
          <p className="mt-1 text-sm font-medium text-red-800/90">
            Zamknij okno, aby kontynuować pakowanie.
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {notes.map((n) => (
            <div
              key={n.id}
              className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-2.5 text-sm font-medium leading-snug text-slate-900"
            >
              {(n.content ?? "").trim()}
            </div>
          ))}
        </div>
        <div className="border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-bold text-white hover:bg-slate-800"
            onClick={onClose}
          >
            Rozumiem — zamknij
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
