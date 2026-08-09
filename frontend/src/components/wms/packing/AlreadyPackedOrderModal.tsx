import { useEffect, useId } from "react";
import { X } from "lucide-react";
import { AppOverlayPortal } from "../../overlay";

type Props = {
  open: boolean;
  packedAtLabel: string | null;
  packedByLabel: string | null;
  busy?: boolean;
  onBackToList: () => void;
  onAccept: () => void | Promise<void>;
  /** X / Escape — zamyka bez logu akceptacji. */
  onDismiss: () => void;
};

function WarningTriangleIcon() {
  return (
    <svg width="72" height="64" viewBox="0 0 72 64" fill="none" aria-hidden>
      <path
        d="M36 6L68 60H4L36 6Z"
        stroke="#1e293b"
        strokeWidth="3.5"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M36 24v18" stroke="#f59e0b" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="36" cy="50" r="2.75" fill="#f59e0b" />
    </svg>
  );
}

/**
 * Popup przy ponownym wejściu do w pełni spakowanego zamówienia (mockup WMS).
 */
export function AlreadyPackedOrderModal({
  open,
  packedAtLabel,
  packedByLabel,
  busy = false,
  onBackToList,
  onAccept,
  onDismiss,
}: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onDismiss]);

  if (!open) return null;

  const metaBits = [packedAtLabel, packedByLabel].filter(Boolean);
  const metaLine = metaBits.length > 0 ? metaBits.join(" - ") : null;

  return (
    <AppOverlayPortal>
      <div
        className="fixed inset-0 z-[5600] flex items-center justify-center bg-slate-900/45 p-4"
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-7"
        >
          <button
            type="button"
            className="absolute right-3 top-3 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Zamknij"
            disabled={busy}
            onClick={onDismiss}
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>

          <div className="flex items-start gap-4 pr-6 sm:gap-5">
            <div className="mt-0.5 shrink-0">
              <WarningTriangleIcon />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-xl font-semibold leading-snug text-slate-900 sm:text-2xl">
                To zamówienie zostało <span className="font-bold text-[#e53935]">już spakowane!</span>
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-800 sm:text-[15px]">
                To zamówienie <span className="font-bold">zostało już spakowane</span> lub wysłane.
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700 sm:text-[15px]">
                Aby uniknąć podwójnej wysyłki, sprawdź jego status.
              </p>
              {metaLine ? (
                <p className="mt-3 text-sm text-slate-800 sm:text-[15px]">
                  <span className="font-bold">Spakowano:</span> {metaLine}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              disabled={busy}
              className="order-2 h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 sm:order-1"
              onClick={onBackToList}
            >
              Wróć do listy zamówień
            </button>
            <button
              type="button"
              disabled={busy}
              className="order-1 h-11 rounded-lg border border-slate-800 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50 sm:order-2"
              onClick={() => void onAccept()}
            >
              {busy ? "Zapisywanie…" : "Akceptuję i przechodzę do pakowania"}
            </button>
          </div>
        </div>
      </div>
    </AppOverlayPortal>
  );
}
