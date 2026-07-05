import { useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (changeSummary: string) => void;
  publishing?: boolean;
};

export function PublishModal({ open, onClose, onConfirm, publishing }: Props) {
  const [summary, setSummary] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Publikacja szablonu</h2>
        <p className="mt-1 text-sm text-slate-500">
          Opublikowana wersja będzie używana przy druku dokumentów powiązanych z tym szablonem.
        </p>
        <label className="mt-4 block text-xs font-medium text-slate-600">
          Opis zmian
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={4}
            placeholder="Np. poprawiono układ tabeli produktów, dodano stopkę magazynu…"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={onClose}>
            Anuluj
          </button>
          <button
            type="button"
            disabled={publishing || !summary.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => onConfirm(summary.trim())}
          >
            Opublikuj
          </button>
        </div>
      </div>
    </div>
  );
}
