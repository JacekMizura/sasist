import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  errorMessage: string;
  /** Seconds before the generate button becomes available (settings delay). */
  delaySeconds: number;
  busy?: boolean;
  onGenerate: () => void;
  onClose: () => void;
};

function humanizeCourierError(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "Nie udało się wygenerować etykiety kurierskiej.";
  const idx = s.indexOf(":");
  if (s.startsWith("courier_label_unavailable") && idx >= 0) {
    const rest = s.slice(idx + 1).trim();
    return rest || "Nie udało się wygenerować etykiety kurierskiej.";
  }
  return s;
}

/**
 * Popup po błędzie generowania etykiety kurierskiej — opcja awaryjnej etykiety zastępczej.
 * Przycisk generowania pojawia się po ``delaySeconds`` (ustawienie WMS).
 */
export function PackingReplacementLabelModal({
  open,
  errorMessage,
  delaySeconds,
  busy = false,
  onGenerate,
  onClose,
}: Props) {
  const delayMs = Math.max(0, Math.min(120, Math.floor(delaySeconds || 0))) * 1000;
  const [ready, setReady] = useState(delayMs <= 0);

  useEffect(() => {
    if (!open) {
      setReady(delayMs <= 0);
      return;
    }
    if (delayMs <= 0) {
      setReady(true);
      return;
    }
    setReady(false);
    const t = window.setTimeout(() => setReady(true), delayMs);
    return () => window.clearTimeout(t);
  }, [open, delayMs]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[5500] flex items-center justify-center bg-slate-900/30 p-4"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="packing-replacement-label-title"
        className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 id="packing-replacement-label-title" className="text-base font-semibold text-slate-900">
            Nie udało się wygenerować etykiety kurierskiej
          </h2>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm text-slate-700">
          <p className="leading-relaxed">{humanizeCourierError(errorMessage)}</p>
          <p className="text-xs leading-relaxed text-slate-500">
            Możesz wygenerować etykietę zastępczą z unikalnym kodem kreskowym. Po rozwiązaniu problemu z kurierem
            zeskanuj kod, aby ponowić generowanie właściwego listu z zapisanymi wyborami pakowania.
          </p>
          {!ready ? (
            <p className="text-xs font-medium text-amber-800">
              Przycisk etykiety zastępczej będzie dostępny za chwilę…
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            disabled={busy}
            onClick={onClose}
          >
            Anuluj
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || !ready}
            onClick={onGenerate}
          >
            {busy ? "Generowanie…" : "Wygeneruj etykietę zastępczą"}
          </button>
        </div>
      </div>
    </div>
  );
}
