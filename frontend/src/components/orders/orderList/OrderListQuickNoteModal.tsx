import { useEffect, useState } from "react";
import { X } from "lucide-react";

const inp =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300";
const lab = "block text-xs font-medium text-slate-600";

export type QuickNoteAudience = "internal" | "warehouse" | "customer";

export type OrderListQuickNoteModalProps = {
  open: boolean;
  orderCount: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: { audience: QuickNoteAudience; text: string }) => Promise<void>;
};

export function OrderListQuickNoteModal({
  open,
  orderCount,
  busy,
  onClose,
  onSubmit,
}: OrderListQuickNoteModalProps) {
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<QuickNoteAudience>("internal");

  useEffect(() => {
    if (!open) return;
    setText("");
    setAudience("internal");
  }, [open]);

  if (!open) return null;

  const subtitle =
    orderCount > 0 ? `Zamówienia: ${orderCount}. Notatka zostanie dodana do ${orderCount === 1 ? "tego zamówienia" : "wszystkich zaznaczonych"}.` : "Nic nie zaznaczono.";

  const submit = async () => {
    const t = text.trim();
    if (!t || orderCount < 1) return;
    try {
      await onSubmit({ audience, text: t });
      onClose();
    } catch {
      /* komunikat obsługuje rodzic */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[87] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="flex w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-note-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 id="quick-note-title" className="text-base font-bold text-slate-900">
              Dodaj notatkę
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            onClick={onClose}
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="space-y-3 px-4 py-3">
          <label className={lab}>
            Treść
            <textarea
              className={`${inp} min-h-[5rem]`}
              disabled={busy || orderCount < 1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Krótka notatka…"
            />
          </label>
          <fieldset>
            <legend className={lab}>Typ</legend>
            <div className="mt-2 flex flex-col gap-2 text-sm text-slate-800">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="qn-audience"
                  checked={audience === "internal"}
                  disabled={busy}
                  onChange={() => setAudience("internal")}
                />
                Wewnętrzna
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="qn-audience"
                  checked={audience === "warehouse"}
                  disabled={busy}
                  onChange={() => setAudience("warehouse")}
                />
                Dla magazynu
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="qn-audience"
                  checked={audience === "customer"}
                  disabled={busy}
                  onChange={() => setAudience("customer")}
                />
                Dla klienta
              </label>
            </div>
          </fieldset>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            onClick={onClose}
          >
            Anuluj
          </button>
          <button
            type="button"
            disabled={busy || orderCount < 1 || !text.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            onClick={() => void submit()}
          >
            {busy ? "Zapisywanie…" : "Dodaj"}
          </button>
        </div>
      </div>
    </div>
  );
}
