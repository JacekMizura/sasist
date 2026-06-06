import type { DocumentSubtype } from "../../hooks/directSales/useDirectSalesSession";

type Props = {
  value: DocumentSubtype;
  onChange: (v: DocumentSubtype) => void;
  disabled?: boolean;
};

export function DocumentPanel({ value, onChange, disabled }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Dokument sprzedaży</div>
      <div className="mt-2 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("RECEIPT")}
          className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition ${
            value === "RECEIPT" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          } disabled:opacity-50`}
        >
          Paragon (PA)
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("INVOICE")}
          className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition ${
            value === "INVOICE" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          } disabled:opacity-50`}
        >
          Faktura VAT (FV)
        </button>
      </div>
      <p className="mt-1 text-[10px] text-slate-400">
        {value === "INVOICE" ? "Wymagany klient z NIP i danymi firmy." : "Szybka sprzedaż detaliczna bez FV."}
      </p>
    </div>
  );
}
