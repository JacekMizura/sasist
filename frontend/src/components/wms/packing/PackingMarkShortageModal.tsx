import { createPortal } from "react-dom";

export type PackingMarkShortageModalProps = {
  open: boolean;
  /** Nazwa statusu z ustawienia „Status dla braków w zamówieniu”. */
  missingStatusName: string | null;
  /** Brak skonfigurowanego statusu — pokaż komunikat konfiguracyjny. */
  missingStatusNotConfigured: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function PackingMarkShortageModal({
  open,
  missingStatusName,
  missingStatusNotConfigured,
  busy = false,
  onCancel,
  onConfirm,
}: PackingMarkShortageModalProps) {
  if (!open || typeof document === "undefined") return null;

  const node = (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="packing-mark-shortage-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-2xl sm:px-8"
        onClick={(e) => e.stopPropagation()}
      >
        {missingStatusNotConfigured ? (
          <>
            <h2 id="packing-mark-shortage-title" className="text-xl font-bold text-slate-950">
              Brak konfiguracji statusu
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Najpierw skonfiguruj <span className="font-semibold">„Status dla braków w zamówieniu”</span> w
              Ustawieniach WMS → Pakowanie → Proces pakowania.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
                onClick={onCancel}
              >
                Rozumiem
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="packing-mark-shortage-title" className="text-xl font-bold text-slate-950">
              Zamówienie zostanie odłożone
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Ze względu na brak produktu zamówienie otrzyma status:{" "}
              <span className="font-bold text-slate-950">{missingStatusName || "—"}</span>.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                onClick={onCancel}
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
                onClick={onConfirm}
              >
                {busy ? "Odkładanie…" : "Odłóż zamówienie"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
