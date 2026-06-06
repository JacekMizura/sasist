import { useState } from "react";
import { User, UserPlus, Building2, MapPin, Search, X, Loader2 } from "lucide-react";

import type { DirectSalesCustomerState } from "../../hooks/directSales/useDirectSalesCustomer";
import { useResolvedDirectSalesSettings } from "../../modules/directSales/settings/resolvedDirectSalesSettings";
import { safeDisplay, safeTrim } from "../../utils/safeStrings";

type CustomerState = DirectSalesCustomerState;

type Props = {
  customer: CustomerState;
  customerId: number | null;
  documentSubtype: "RECEIPT" | "INVOICE";
  disabled?: boolean;
};

export function CustomerPanel({ customer, customerId, documentSubtype, disabled }: Props) {
  const resolvedDirectSalesSettings = useResolvedDirectSalesSettings();
  const [showInvoice, setShowInvoice] = useState(false);
  const [nip, setNip] = useState("");
  const [company, setCompany] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [postal, setPostal] = useState("");

  return (
    <div className="bg-white rounded-3xl p-5 border border-blue-50 shadow-sm space-y-4">
      {/* NAGŁÓWEK */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-blue-900/50 uppercase tracking-wider">Klient</h3>
        {customerId && resolvedDirectSalesSettings.allow_anonymous ? (
          <button
            type="button"
            disabled={disabled || customer.busy}
            onClick={() => void customer.attachCustomer(null)}
            className="text-[10px] font-bold text-red-500 hover:text-red-600 transition-colors"
          >
            Anuluj wybór
          </button>
        ) : null}
      </div>

      {/* WYBRANY KLIENT */}
      {customer.detail ? (
        <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <User size={20} />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-slate-900 truncate">
                {safeDisplay(customer.detail.company_name, `${customer.detail.first_name} ${customer.detail.last_name}`)}
              </div>
              {customer.detail.nip && <div className="text-[10px] font-bold text-blue-600">NIP: {customer.detail.nip}</div>}
            </div>
          </div>
        </div>
      ) : (
        /* WYSZUKIWARKA KLIENTA */
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-blue-300" size={18} />
            <input
              type="search"
              disabled={disabled || customer.busy}
              value={customer.search}
              onChange={(e) => customer.setSearch(e.target.value)}
              placeholder="Szukaj (nazwa, NIP, tel)…"
              className="w-full pl-10 pr-4 py-3 bg-white border-2 border-blue-50 rounded-2xl focus:border-blue-500 focus:outline-none transition-all shadow-sm text-sm font-medium"
            />
          </div>
          
          {customer.loading && <div className="text-xs font-bold text-blue-400 animate-pulse">Wyszukiwanie...</div>}

          {customer.results.length > 0 && (
            <ul className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
              {customer.results.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => void customer.attachCustomer(row.id)}
                    className="w-full text-left p-3 rounded-xl hover:bg-blue-50 transition-colors group"
                  >
                    <div className="text-sm font-bold text-slate-900 group-hover:text-blue-700">{row.display_name}</div>
                    <div className="text-[10px] text-slate-400 font-medium">{[row.phone, row.email, row.nip].filter(Boolean).join(" • ")}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* FORMULARZ FV / SZYBKI KLIENT */}
      {documentSubtype === "INVOICE" && resolvedDirectSalesSettings.require_customer_for_invoice && !customerId ? (
        <div className="p-3 bg-amber-50 text-amber-800 text-[10px] font-bold rounded-xl border border-amber-200">
          Faktura wymaga klienta z danymi firmy.
        </div>
      ) : null}

      {/* ROZWIJANY FORMULARZ DANYCH FV */}
      {documentSubtype === "INVOICE" ? (
        <div className="space-y-2 pt-2 border-t border-blue-50">
          <div className="flex gap-2">
            <input value={nip} onChange={(e) => setNip(e.target.value)} placeholder="NIP" className="flex-1 p-2 text-xs border border-blue-100 rounded-lg" />
            <button 
              onClick={() => void customer.lookupByNip(nip)} 
              className="bg-slate-800 text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-slate-900"
            >
              {customer.nipLookupLoading ? <Loader2 className="animate-spin" size={12} /> : "Pobierz"}
            </button>
          </div>
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Nazwa firmy" className="w-full p-2 text-xs border border-blue-100 rounded-lg" />
          <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Ulica i nr" className="w-full p-2 text-xs border border-blue-100 rounded-lg" />
          <div className="grid grid-cols-2 gap-2">
            <input value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="Kod" className="p-2 text-xs border border-blue-100 rounded-lg" />
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Miasto" className="p-2 text-xs border border-blue-100 rounded-lg" />
          </div>
          <button
            onClick={() => void customer.quickCreate({ firstName: "FV", lastName: safeTrim(company) || "Klient", nip, companyName: company, street, city, postalCode: postal })}
            className="w-full bg-blue-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors"
          >
            Zapisz i przypisz do FV
          </button>
        </div>
      ) : resolvedDirectSalesSettings.quick_create_customer ? (
        <button
          onClick={() => setShowInvoice((v) => !v)}
          className="w-full py-2 text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1"
        >
          {showInvoice ? <X size={12} /> : <UserPlus size={12} />} 
          {showInvoice ? "Ukryj szybkie tworzenie" : "Dodaj szybkiego klienta"}
        </button>
      ) : null}

      {showInvoice && documentSubtype !== "INVOICE" && (
        <button
          onClick={() => void customer.quickCreate({ firstName: "Klient", lastName: "Terminal" })}
          className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
        >
          Utwórz anonimowego klienta
        </button>
      )}

      {customer.error && <p className="text-[10px] font-bold text-red-500">{customer.error}</p>}
    </div>
  );
}