import { useState } from "react";

import { safeDisplay, safeTrim } from "../../../../utils/safeStrings";
import type { useDirectSalesCustomer } from "../hooks/useDirectSalesCustomer";

type CustomerState = ReturnType<typeof useDirectSalesCustomer>;

type Props = {
  customer: CustomerState;
  customerId: number | null;
  disabled?: boolean;
};

export function CustomerPanel({ customer, customerId, disabled }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nip, setNip] = useState("");
  const [company, setCompany] = useState("");

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
            Wyczyść
          </button>
        ) : null}
      </div>
      {customer.detail ? (
        <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
          <div className="font-medium text-slate-900">
            {safeDisplay(customer.detail.company_name, `${customer.detail.first_name} ${customer.detail.last_name}`)}
          </div>
          {customer.detail.nip ? <div>NIP: {customer.detail.nip}</div> : null}
          {customer.detail.phone ? <div>Tel: {customer.detail.phone}</div> : null}
          {customer.detail.email ? <div>{customer.detail.email}</div> : null}
        </div>
      ) : (
        <>
          <input
            type="search"
            disabled={disabled || customer.busy}
            value={customer.search}
            onChange={(e) => customer.setSearch(e.target.value)}
            placeholder="Szukaj klienta…"
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
      <button
        type="button"
        disabled={disabled || customer.busy}
        onClick={() => setShowCreate((v) => !v)}
        className="text-xs font-medium text-sky-700 disabled:opacity-50"
      >
        {showCreate ? "Anuluj tworzenie" : "+ Szybki klient"}
      </button>
      {showCreate ? (
        <div className="space-y-1.5 border-t border-slate-100 pt-2">
          <div className="grid grid-cols-2 gap-1">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Imię"
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Nazwisko"
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Firma (FV)"
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          />
          <input
            value={nip}
            onChange={(e) => setNip(e.target.value)}
            placeholder="NIP"
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Telefon / odbiór"
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={disabled || customer.busy || !safeTrim(firstName)}
            onClick={() =>
              void customer.quickCreate({
                firstName,
                lastName,
                phone,
                email,
                nip,
                companyName: company,
              }).then(() => setShowCreate(false))
            }
            className="w-full rounded bg-slate-800 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Utwórz i przypisz
          </button>
        </div>
      ) : null}
      {customer.error ? <p className="text-xs text-red-600">{customer.error}</p> : null}
    </div>
  );
}
