import { createPortal } from "react-dom";
import { Barcode } from "lucide-react";

type Props = {
  open: boolean;
  title?: string;
  hint?: string;
  onClose: () => void;
};

/** Full-screen scan prompt — same chrome as packing mode cart/basket modals. */
export function PackingHandoffScanModal({
  open,
  title = "Skanuj wózek / koszyk",
  hint = "Zeskanuj kod wózka, wózka z koszykami albo konkretnego koszyka",
  onClose,
}: Props) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="packing-handoff-scan-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-2xl sm:px-12 sm:py-12"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-950"
          onClick={onClose}
        >
          Anuluj
        </button>
        <h2
          id="packing-handoff-scan-title"
          className="pr-16 text-center text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl"
        >
          {title}
        </h2>
        <div className="mt-10 flex flex-col items-center">
          <Barcode className="h-28 w-28 text-slate-900 sm:h-36 sm:w-36" strokeWidth={1.15} aria-hidden />
          <p className="mt-8 text-center text-lg font-semibold text-slate-900 sm:text-xl">{hint}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
