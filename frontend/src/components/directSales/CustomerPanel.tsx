import { useState } from "react";
import { Building2, Loader2, Search, User } from "lucide-react";

import { lookupDirectSaleNip, postInvoiceCustomer } from "../../api/directSalesApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import type { DirectSalesCustomerState } from "../../hooks/directSales/useDirectSalesCustomer";
import type { DirectSaleSession } from "../../utils/normalizeDirectSales";
import { useResolvedDirectSalesSettings } from "../../modules/directSales/settings/resolvedDirectSalesSettings";
import { safeDisplay, safeTrim } from "../../utils/safeStrings";

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

  const showSearch = !customerIsRetail && customer.detail;

  return (
    <div className="bg-white rounded-3xl p-5 border border-blue-50 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-blue-900/50 uppercase tracking-wider">Klient — faktura VAT</h3>
      </div>

      {showSearch ? (
        <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <User size={20} />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-slate-900 truncate">
                {safeDisplay(customer.detail?.company_name, `${customer.detail?.first_name} ${customer.detail?.last_name}`)}
              </div>
              {customer.detail?.nip ? (
                <div className="text-[10px] font-bold text-blue-600">NIP: {customer.detail.nip}</div>
              ) : null}
            </div>
          </div>
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
              placeholder="Szukaj w CRM (nazwa, NIP)…"
              className="w-full pl-10 pr-4 py-3 bg-white border-2 border-blue-50 rounded-2xl text-sm font-medium"
            />
          </div>
          {customer.results.length > 0 ? (
            <ul className="max-h-32 overflow-y-auto space-y-1">
              {customer.results.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => void customer.attachCustomer(row.id)}
                    className="w-full text-left p-2 rounded-xl hover:bg-blue-50 text-sm font-bold"
                  >
                    {row.display_name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <div className="space-y-2 pt-2 border-t border-blue-50">
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
              } catch (e) {
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
              if (resolvedDirectSalesSettings.auto_save_customers) {
                await customer.attachCustomer(s.customer_id);
              }
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
    </div>
  );
}
