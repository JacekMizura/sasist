import { FileText, Receipt } from "lucide-react";
import type { DocumentSubtype } from "../../hooks/directSales/useDirectSalesSession";

type Props = {
  value: DocumentSubtype;
  onChange: (v: DocumentSubtype) => void;
  disabled?: boolean;
};

export function DocumentPanel({ value, onChange, disabled }: Props) {
  return (
    <div className="bg-white rounded-3xl p-5 border border-blue-50 shadow-sm">
      <h3 className="text-xs font-bold text-blue-900/50 uppercase tracking-wider mb-4">
        Dokument sprzedaży
      </h3>
      
      <div className="flex gap-2 bg-blue-50/50 p-1 rounded-xl border border-blue-50">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("RECEIPT")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-bold transition-all ${
            value === "RECEIPT" 
              ? "bg-white text-blue-700 shadow-sm border border-blue-100" 
              : "text-slate-500 hover:text-slate-700"
          } disabled:opacity-50`}
        >
          <Receipt size={18} /> Paragon (PA)
        </button>
        
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("INVOICE")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-bold transition-all ${
            value === "INVOICE" 
              ? "bg-white text-blue-700 shadow-sm border border-blue-100" 
              : "text-slate-500 hover:text-slate-700"
          } disabled:opacity-50`}
        >
          <FileText size={18} />
          Faktura VAT (FV)
        </button>
      </div>
      
      <p className="mt-4 text-[11px] font-medium text-slate-400 text-center">
        {value === "INVOICE"
          ? "Uzupełnij dane firmy (NIP) przed płatnością."
          : "Paragon — klient detaliczny przypisany automatycznie."}
      </p>
    </div>
  );
}