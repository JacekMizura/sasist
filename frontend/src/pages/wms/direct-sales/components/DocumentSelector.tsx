import type { DocumentSubtype } from "../hooks/useDirectSalesSession";

type Props = {
  value: DocumentSubtype;
  onChange: (v: DocumentSubtype) => void;
  disabled?: boolean;
};

export function DocumentSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-slate-600">Dokument</div>
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("RECEIPT")}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
            value === "RECEIPT"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          } disabled:opacity-50`}
        >
          PA
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("INVOICE")}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
            value === "INVOICE"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          } disabled:opacity-50`}
        >
          FV
        </button>
      </div>
      <p className="text-[10px] text-slate-400">Seria z reguł rozwiązywania dokumentów.</p>
    </div>
  );
}
