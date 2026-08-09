import { useEffect, useRef } from "react";
import { AppOverlayPortal } from "../../overlay";
import { ScannerHandler } from "./ScannerHandler";

type Props = {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onScanBarcode: (barcode: string) => void;
  onCancel: () => void;
};

/** Popup zgody kierownika przy przekroczeniu limitu paczek (skan kodu logowania). */
export function PackingManagerParcelApprovalModal({
  open,
  busy = false,
  error = null,
  onScanBarcode,
  onCancel,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <AppOverlayPortal>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4">
        <ScannerHandler enabled={open && !busy} onScan={onScanBarcode} />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="packing-manager-approval-title"
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        >
          <h2 id="packing-manager-approval-title" className="text-lg font-bold text-slate-900">
            Wymagana zgoda kierownika
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Limit paczek bez potwierdzenia został przekroczony. Zeskanuj kod kierownika, aby dodać
            kolejną paczkę.
          </p>
          <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Kod kierownika
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              disabled={busy}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-slate-500 disabled:opacity-50"
              placeholder="Zeskanuj lub wpisz kod…"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const v = (e.currentTarget.value || "").trim();
                if (!v || busy) return;
                e.currentTarget.value = "";
                onScanBarcode(v);
              }}
            />
          </label>
          {error ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Anuluj
            </button>
          </div>
        </div>
      </div>
    </AppOverlayPortal>
  );
}
