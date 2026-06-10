import { useEffect, useState } from "react";
import { Building2, Loader2, Search, User, X } from "lucide-react";

import { lookupDirectSaleNip, postInvoiceCustomer } from "../../api/directSalesApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import type { DirectSalesCustomerState } from "../../hooks/directSales/useDirectSalesCustomer";
import type { DirectSaleSession } from "../../utils/normalizeDirectSales";
import { useResolvedDirectSalesSettings } from "../../modules/directSales/settings/resolvedDirectSalesSettings";
import { customerPickerSubtitle } from "../../modules/customers/customerProfile";
import {
  formatCustomerAddressStreet,
  getCustomerDefaultAddress,
  getCustomerDisplayName,
} from "../../utils/getCustomerDisplayName";
import { safeTrim } from "../../utils/safeStrings";

type Props = {
  customer: DirectSalesCustomerState;
  customerId: number | null;
  customerIsRetail: boolean;
  sessionId: number | null;
  warehouseId: number;
  disabled?: boolean;
  onSessionUpdated: (session: DirectSaleSession) => void;
};

export function CustomerPanel({
  customer,
  customerId,
  customerIsRetail,
  sessionId,
  warehouseId,
  disabled,
  onSessionUpdated,
}: Props) {
  const resolvedDirectSalesSettings = useResolvedDirectSalesSettings();
  const [nip, setNip] = useState("");
  const [company, setCompany] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [postal, setPostal] = useState("");
  const [nipError, setNipError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nipLoading, setNipLoading] = useState(false);

  useEffect(() => {
    const d = customer.detail;
    if (!d) return;
    setCompany(d.company_name ?? "");
    setNip(d.nip ?? "");
    const addr = getCustomerDefaultAddress(d.addresses);
    if (addr) {
      setStreet(formatCustomerAddressStreet(addr));
      setPostal(addr.postal_code ?? "");
      setCity(addr.city ?? "");
    }
  }, [customer.detail?.id, customer.detail]);

  const showAssigned = customerId != null && !customerIsRetail;
  const displayName = customer.detail ? getCustomerDisplayName(customer.detail) : null;

  return (
    <div className="bg-white rounded-3xl p-5 border border-blue-50 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-blue-900/50 uppercase tracking-wider">Klient</h3>
        {showAssigned ? (
          <button
            type="button"
            disabled={disabled || customer.busy}
            onClick={() => void customer.attachCustomer(null)}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50"
          >
            <X size={12} aria-hidden />
            Wyczyść
          </button>
        ) : null}
      </div>

      {showAssigned ? (
        <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100">
          {customer.detail ? (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <User size={20} />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="font-bold text-slate-900 truncate">{displayName}</div>
                {customer.detail.nip ? (
                  <div className="text-[10px] font-bold text-blue-600">NIP: {customer.detail.nip}</div>
                ) : null}
                {customer.detail.phone ? (
                  <div className="text-[10px] text-slate-600">Tel: {customer.detail.phone}</div>
                ) : null}
                {customer.detail.email ? (
                  <div className="text-[10px] text-slate-600 truncate">{customer.detail.email}</div>
                ) : null}
                {(() => {
                  const addr = getCustomerDefaultAddress(customer.detail.addresses);
                  if (!addr) return null;
                  const line = [formatCustomerAddressStreet(addr), addr.postal_code, addr.city]
                    .filter(Boolean)
                    .join(", ");
                  return line ? <div className="text-[10px] text-slate-600">{line}</div> : null;
                })()}
              </div>
            </div>
          ) : customer.detailLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Wczytywanie danych klienta…
            </div>
          ) : (
            <div className="text-xs text-slate-500">Brak szczegółów klienta.</div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-blue-300" size={18} />
            <input
              type="search"
              disabled={disabled || customer.busy}
              value={customer.search}
              onChange={(e) => customer.setSearch(e.target.value)}
              placeholder="Szukaj klienta (min. 2 znaki)…"
              className="w-full pl-10 pr-4 py-3 bg-white border-2 border-blue-50 rounded-2xl text-sm font-medium disabled:opacity-50"
            />
          </div>
          {customer.searchLoading ? <p className="text-[10px] text-slate-400">Szukam…</p> : null}
          {customer.results.length > 0 ? (
            <ul className="max-h-32 overflow-y-auto space-y-1">
              {customer.results.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    disabled={disabled || customer.busy}
                    onClick={() => void customer.attachCustomer(row.id)}
                    className="w-full rounded-xl p-2 text-left hover:bg-blue-50 disabled:opacity-50"
                  >
                    <div className="text-sm font-bold text-slate-900">{getCustomerDisplayName(row)}</div>
                    <div className="mt-0.5 whitespace-pre-line text-[11px] font-medium text-slate-500">
                      {customerPickerSubtitle(row)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <div className="space-y-2 pt-2 border-t border-blue-50">
        <p className="text-[10px] font-bold uppercase tracking-wide text-blue-900/40">Dane do faktury</p>
        <div className="flex gap-2">
          <input
            value={nip}
            onChange={(e) => setNip(e.target.value)}
            placeholder="NIP"
            className="flex-1 p-2 text-xs border border-blue-100 rounded-lg"
          />
          <button
            type="button"
            disabled={disabled || nipLoading}
            onClick={async () => {
              setNipError(null);
              const q = safeTrim(nip);
              if (q.length < 10) {
                setNipError("Podaj 10-cyfrowy NIP.");
                return;
              }
              setNipLoading(true);
              try {
                const hit = await lookupDirectSaleNip({
                  tenantId: DAMAGE_TENANT_ID,
                  warehouseId,
                  nip: q,
                });
                if (!hit.ok) {
                  setNipError(hit.error ?? "Nie znaleziono podmiotu.");
                  return;
                }
                if (hit.company_name) setCompany(hit.company_name);
                if (hit.street) setStreet(hit.street);
                if (hit.city) setCity(hit.city);
                if (hit.postal_code) setPostal(hit.postal_code);
                if (hit.customer_id) {
                  await customer.attachCustomer(hit.customer_id);
                }
              } catch {
                setNipError("Błąd pobierania danych.");
              } finally {
                setNipLoading(false);
              }
            }}
            className="bg-slate-800 text-white px-3 py-1 rounded-lg text-[10px] font-bold"
          >
            {nipLoading ? <Loader2 className="animate-spin" size={12} /> : "Pobierz z MF"}
          </button>
        </div>
        {nipError ? <p className="text-[10px] text-red-600 font-medium">{nipError}</p> : null}
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Nazwa firmy"
          className="w-full p-2 text-xs border border-blue-100 rounded-lg"
        />
        <input
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          placeholder="Ulica i nr"
          className="w-full p-2 text-xs border border-blue-100 rounded-lg"
        />
        <div className="grid grid-cols-2 gap-2">
          <input value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="Kod" className="p-2 text-xs border border-blue-100 rounded-lg" />
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Miasto" className="p-2 text-xs border border-blue-100 rounded-lg" />
        </div>
        <button
          type="button"
          disabled={disabled || saving || !sessionId || !safeTrim(company) || safeTrim(nip).length < 10}
          onClick={async () => {
            if (!sessionId) return;
            setSaving(true);
            setNipError(null);
            try {
              const s = await postInvoiceCustomer({
                tenantId: DAMAGE_TENANT_ID,
                warehouseId,
                sessionId,
                nip: safeTrim(nip),
                companyName: safeTrim(company),
                street: safeTrim(street) || null,
                postalCode: safeTrim(postal) || null,
                city: safeTrim(city) || null,
              });
              onSessionUpdated(s);
              await customer.refreshCustomerDetail(s.customer_id);
            } catch {
              setNipError("Nie udało się zapisać klienta faktury.");
            } finally {
              setSaving(false);
            }
          }}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-xl text-xs font-bold disabled:opacity-40"
        >
          <Building2 size={14} />
          {saving ? "Zapisywanie…" : "Zapisz klienta i przypisz do FV"}
        </button>
      </div>

      {customer.error ? <p className="text-xs text-red-600">{customer.error}</p> : null}
    </div>
  );
}
