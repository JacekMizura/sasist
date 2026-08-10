import type { ReactNode } from "react";
import { AppOverlayPortal } from "../../overlay";

/** Lightweight Sellasist-style alert with OK dismiss. */
export function PickingProcessAlert({
  open,
  message,
  onClose,
  tone = "error",
}: {
  open: boolean;
  message: ReactNode;
  onClose: () => void;
  tone?: "error" | "info" | "success";
}) {
  if (!open) return null;
  const shell =
    tone === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : tone === "info"
        ? "border-sky-300 bg-sky-50 text-sky-950"
        : "border-red-300 bg-red-50 text-red-900";

  return (
    <AppOverlayPortal>
      <div className="fixed inset-x-0 top-16 z-[75] flex justify-center px-4 pointer-events-none">
        <div
          className={`pointer-events-auto w-full max-w-md rounded-lg border px-4 py-3 shadow-sm ${shell}`}
          role="alertdialog"
          aria-modal="true"
        >
          <p className="text-center text-sm font-semibold leading-snug">{message}</p>
          <button
            type="button"
            className="mt-3 w-full rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-50"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    </AppOverlayPortal>
  );
}
