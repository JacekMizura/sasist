import { User } from "lucide-react";
import { RETAIL_CUSTOMER_LABEL } from "./directSalesTerminology";

export function RetailCustomerBadge() {
  return (
    <div className="bg-emerald-50/80 rounded-2xl p-4 border border-emerald-100">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
          <User size={20} />
        </div>
        <div>
          <div className="font-bold text-slate-900">{RETAIL_CUSTOMER_LABEL}</div>
          <div className="text-[10px] font-medium text-emerald-700">Sprzedaż detaliczna — paragon</div>
        </div>
      </div>
    </div>
  );
}
