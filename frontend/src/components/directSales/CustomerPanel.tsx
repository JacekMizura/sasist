import { useState } from "react";

import type { useDirectSalesCustomer } from "../../hooks/directSales/useDirectSalesCustomer";
import { safeDisplay, safeTrim } from "../../utils/safeStrings";

type CustomerState = ReturnType<typeof useDirectSalesCustomer>;

type Props = {
  customer: CustomerState;
  customerId: number | null;
  documentSubtype: "RECEIPT" | "INVOICE";
  disabled?: boolean;
};

export function CustomerPanel({ customer, customerId, documentSubtype, disabled }: Props) {
  const [showInvoice, setShowInvoice] = useState(false);
  const [nip, setNip] = useState("");
  const [company, setCompany] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [postal, setPostal] = useState("");

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Klient</h3>
        {customerId ? (
          <button
            type="button"
            disabled={disabled || customer.busy}
            onClick={() => void customer.attachCustomer(null)}
            className="text-[10px] text-slate-500 hover:text-slate-800 disabled:opacity-50"
          >
            Sprzedaż anonimowa
          </button>
        ) : null}
      </div>
      {customer.detail ? (
        <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
          <div className="font-medium text-slate-900">
            {safeDisplay(customer.detail.company_name, `${customer.detail.first_name} ${customer.detail.last_name}`)}
          </div>
          {customer.detail.nip ? <div>NIP: {customer.detail.nip}</div> : null}
          {customer.detail.addresses[0] ? (
            <div>
              {customer.detail.addresses[0].street} {customer.detail.addresses[0].house_number},{" "}
              {customer.detail.addresses[0].postal_code} {customer.detail.addresses[0].city}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <input
            type="search"
            disabled={disabled || customer.busy}
            value={customer.search}
            onChange={(e) => customer.setSearch(e.target.value)}
            placeholder="Szukaj klienta (nazwa, tel, NIP)…"
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50"
          />
          {customer.loading ? <p className="text-[10px] text-slate-400">Szukam…</p> : null}
          {customer.results.length ? (
            <ul className="max-h-28 overflow-auto rounded border border-slate-100">
              {customer.results.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    disabled={disabled || customer.busy}
                    onClick={() => void customer.attachCustomer(row.id)}
                    className="flex w-full flex-col px-2 py-1.5 text-left text-xs hover:bg-sky-50 disabled:opacity-50"
                  >
                    <span className="font-medium text-slate-900">{row.display_name}</span>
                    <span className="text-slate-500">
                      {[row.phone, row.email, row.nip].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      {documentSubtype === "INVOICE" ? (
        <div className="space-y-1.5 border-t border-slate-100 pt-2">
          <p className="text-[10px] font-medium text-slate-600">Dane do FV</p>
          <div className="flex gap-1">
            <input
              value={nip}
              onChange={(e) => setNip(e.target.value)}
              placeholder="NIP"
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
            />
            <button
              type="button"
              disabled={disabled || customer.nipLookupLoading}
              onClick={() => void customer.lookupByNip(nip)}
              className="shrink-0 rounded bg-slate-700 px-2 py-1 text-[10px] text-white disabled:opacity-50"
            >
              {customer.nipLookupLoading ? "…" : "Pobierz"}
            </button>
          </div>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Nazwa firmy"
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          />
          <input
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            placeholder="Ulica"
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          />
          <div className="grid grid-cols-2 gap-1">
            <input
              value={postal}
              onChange={(e) => setPostal(e.target.value)}
              placeholder="Kod pocztowy"
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Miasto"
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          <button
            type="button"
            disabled={disabled || customer.busy || !safeTrim(company)}
            onClick={() =>
              void customer.quickCreate({
                firstName: "FV",
                lastName: safeTrim(company) || "Klient",
                nip,
                companyName: company,
                street,
                city,
                postalCode: postal,
              })
            }
            className="w-full rounded bg-slate-800 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Zapisz i przypisz do FV
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || customer.busy}
          onClick={() => setShowInvoice((v) => !v)}
          className="text-xs font-medium text-sky-700 disabled:opacity-50"
        >
          {showInvoice ? "Ukryj szybkiego klienta" : "+ Szybki klient (paragon)"}
        </button>
      )}
      {showInvoice && documentSubtype !== "INVOICE" ? (
        <button
          type="button"
          disabled={disabled || customer.busy}
          onClick={() =>
            void customer.quickCreate({
              firstName: "Klient",
              lastName: "Terminal",
            })
          }
          className="w-full rounded border border-slate-300 py-1.5 text-xs disabled:opacity-50"
        >
          Utwórz anonimowego klienta
        </button>
      ) : null}
      {customer.error ? <p className="text-xs text-red-600">{customer.error}</p> : null}
    </div>
  );
}
