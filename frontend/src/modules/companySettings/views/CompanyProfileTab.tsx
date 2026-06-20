import { Landmark, Loader2 } from "lucide-react";

import { AppButton } from "../../../components/app-shell";
import { PurchasingInfoNotice, PurchasingPageShell, purchasingBtnPrimary } from "../../purchasing/ui";
import { CompanyFormField, companyInputClass } from "../components/CompanyFormField";
import { useCompanySettings } from "../context/CompanySettingsContext";

export default function CompanyProfileTab() {
  const { form, setForm, profileLoading, profileErr, profileDirty, profileSaving, saveProfile } = useCompanySettings();

  return (
    <PurchasingPageShell
      status={
        profileErr ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{profileErr}</div>
        ) : null
      }
      info={
        profileDirty ? (
          <PurchasingInfoNotice tone="amber">Masz niezapisane zmiany — zapisz je przed opuszczeniem zakładki.</PurchasingInfoNotice>
        ) : null
      }
      table={
        profileLoading || !form ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Wczytywanie…
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="grid gap-6 px-4 py-5 lg:grid-cols-2">
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dane rejestrowe</p>
                <CompanyFormField label="Nazwa firmy">
                  <input className={companyInputClass} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
                </CompanyFormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CompanyFormField label="NIP">
                    <input className={companyInputClass} value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} />
                  </CompanyFormField>
                  <CompanyFormField label="REGON">
                    <input className={companyInputClass} value={form.regon} onChange={(e) => setForm({ ...form, regon: e.target.value })} />
                  </CompanyFormField>
                </div>
                <CompanyFormField label="Ulica">
                  <input className={companyInputClass} value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
                </CompanyFormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CompanyFormField label="Nr domu">
                    <input className={companyInputClass} value={form.building_number} onChange={(e) => setForm({ ...form, building_number: e.target.value })} />
                  </CompanyFormField>
                  <CompanyFormField label="Nr lokalu">
                    <input className={companyInputClass} value={form.apartment_number} onChange={(e) => setForm({ ...form, apartment_number: e.target.value })} />
                  </CompanyFormField>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CompanyFormField label="Miasto">
                    <input className={companyInputClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </CompanyFormField>
                  <CompanyFormField label="Kod pocztowy">
                    <input className={companyInputClass} value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
                  </CompanyFormField>
                </div>
                <CompanyFormField label="Kraj">
                  <input className={companyInputClass} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="np. Polska" />
                </CompanyFormField>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-slate-500" aria-hidden />
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bank i kontakt</p>
                </div>
                <CompanyFormField label="Bank">
                  <input className={companyInputClass} value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
                </CompanyFormField>
                <CompanyFormField label="IBAN">
                  <input className={companyInputClass} value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="PL…" />
                </CompanyFormField>
                <CompanyFormField label="SWIFT">
                  <input className={companyInputClass} value={form.bic_swift} onChange={(e) => setForm({ ...form, bic_swift: e.target.value })} />
                </CompanyFormField>
                <CompanyFormField label="Telefon">
                  <input className={companyInputClass} value={form.company_phone} onChange={(e) => setForm({ ...form, company_phone: e.target.value })} />
                </CompanyFormField>
                <CompanyFormField label="E-mail">
                  <input type="email" className={companyInputClass} value={form.document_email} onChange={(e) => setForm({ ...form, document_email: e.target.value })} />
                </CompanyFormField>
                <CompanyFormField label="WWW">
                  <input className={companyInputClass} value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} placeholder="https://…" />
                </CompanyFormField>
              </div>
            </div>
            <div className="flex justify-end border-t border-slate-100 px-4 py-3">
              <AppButton variant="primary" className={purchasingBtnPrimary} disabled={!profileDirty || profileSaving} onClick={() => void saveProfile()}>
                {profileSaving ? "Zapisywanie…" : "Zapisz zmiany"}
              </AppButton>
            </div>
          </div>
        )
      }
    />
  );
}
