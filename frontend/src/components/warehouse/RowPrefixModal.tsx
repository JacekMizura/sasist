import React, { useState, useEffect } from "react";

export type RowPrefixModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (prefix: string) => void;
  defaultPrefix?: string;
};

export function RowPrefixModal({
  open,
  onClose,
  onConfirm,
  defaultPrefix = "A",
}: RowPrefixModalProps) {
  const [prefix, setPrefix] = useState(defaultPrefix);

  useEffect(() => {
    if (open) setPrefix(defaultPrefix);
  }, [open, defaultPrefix]);

  const handleConfirm = () => {
    const p = (prefix || "A").trim() || "A";
    onConfirm(p);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="row-prefix-modal-title"
    >
      <div
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-lg w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="row-prefix-modal-title" className="text-base font-semibold text-slate-800 mb-3">
          Wybierz indeks rzędu
        </h2>
        <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="row-prefix-input">
          Prefix rzędu
        </label>
        <input
          id="row-prefix-input"
          type="text"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="A"
          maxLength={4}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 mb-4"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-cyan-600 text-white hover:bg-cyan-500"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
