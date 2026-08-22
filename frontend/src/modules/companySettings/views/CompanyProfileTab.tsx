import { FileText, Landmark, Loader2 } from "lucide-react";

import { FORM_FIELD_DENSITY, Input, PrimaryButton } from "@/design-system";
import { CompanyFormField } from "../components/CompanyFormField";
import { useCompanySettings } from "../context/CompanySettingsContext";
import { DocumentTemplateScopeSection } from "../../../pages/Settings/document-templates/components/DocumentTemplateScopeSection";
import { COMPANY_SCOPE_KINDS } from "../../../pages/Settings/document-templates/documentTemplateScopeKinds";
import {
  companyCardClass,
  companySectionTitleClass,
} from "../companySettingsUi";

export default function CompanyProfileTab() {
  const { form, setForm, profileLoading, profileErr, profileDirty, profileSaving, saveProfile, tenantId } =
    useCompanySettings();

  if (profileLoading || !form) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Wczytywanie…
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-8">
      {profileErr ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{profileErr}</div>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <section className="min-w-0 space-y-4">
          <h2 className={companySectionTitleClass}>
            <FileText className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden />
            Dane rejestrowe
          </h2>
          <CompanyFormField label="Nazwa firmy">
            <Input
              density={FORM_FIELD_DENSITY}
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            />
          </CompanyFormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <CompanyFormField label="NIP">
              <Input
                density={FORM_FIELD_DENSITY}
                value={form.nip}
                onChange={(e) => setForm({ ...form, nip: e.target.value })}
              />
            </CompanyFormField>
            <CompanyFormField label="REGON">
              <Input
                density={FORM_FIELD_DENSITY}
                value={form.regon}
                onChange={(e) => setForm({ ...form, regon: e.target.value })}
              />
            </CompanyFormField>
          </div>
          <CompanyFormField label="Ulica">
            <Input
              density={FORM_FIELD_DENSITY}
              value={form.street}
              onChange={(e) => setForm({ ...form, street: e.target.value })}
            />
          </CompanyFormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <CompanyFormField label="Nr domu">
              <Input
                density={FORM_FIELD_DENSITY}
                value={form.building_number}
                onChange={(e) => setForm({ ...form, building_number: e.target.value })}
              />
            </CompanyFormField>
            <CompanyFormField label="Nr lokalu">
              <Input
                density={FORM_FIELD_DENSITY}
                value={form.apartment_number}
                onChange={(e) => setForm({ ...form, apartment_number: e.target.value })}
              />
            </CompanyFormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.85fr)]">
            <CompanyFormField label="Miasto">
              <Input
                density={FORM_FIELD_DENSITY}
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </CompanyFormField>
            <CompanyFormField label="Kod pocztowy">
              <Input
                density={FORM_FIELD_DENSITY}
                value={form.postal_code}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
              />
            </CompanyFormField>
          </div>
          <CompanyFormField label="Kraj">
            <Input
              density={FORM_FIELD_DENSITY}
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              placeholder="np. Polska"
            />
          </CompanyFormField>
        </section>

        <section className="min-w-0 space-y-4">
          <h2 className={companySectionTitleClass}>
            <Landmark className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden />
            Bank i kontakt
          </h2>
          <CompanyFormField label="Bank">
            <Input
              density={FORM_FIELD_DENSITY}
              value={form.bank_name}
              onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
            />
          </CompanyFormField>
          <CompanyFormField label="IBAN">
            <Input
              density={FORM_FIELD_DENSITY}
              value={form.iban}
              onChange={(e) => setForm({ ...form, iban: e.target.value })}
              placeholder="PL…"
            />
          </CompanyFormField>
          <CompanyFormField label="SWIFT">
            <Input
              density={FORM_FIELD_DENSITY}
              value={form.bic_swift}
              onChange={(e) => setForm({ ...form, bic_swift: e.target.value })}
            />
          </CompanyFormField>
          <CompanyFormField label="Telefon">
            <Input
              density={FORM_FIELD_DENSITY}
              value={form.company_phone}
              onChange={(e) => setForm({ ...form, company_phone: e.target.value })}
            />
          </CompanyFormField>
          <CompanyFormField label="E-mail">
            <Input
              type="email"
              density={FORM_FIELD_DENSITY}
              value={form.document_email}
              onChange={(e) => setForm({ ...form, document_email: e.target.value })}
            />
          </CompanyFormField>
          <CompanyFormField label="WWW">
            <Input
              density={FORM_FIELD_DENSITY}
              value={form.website_url}
              onChange={(e) => setForm({ ...form, website_url: e.target.value })}
              placeholder="https://…"
            />
          </CompanyFormField>
        </section>
      </div>

      <section className={`${companyCardClass} p-5 sm:p-6`}>
        <DocumentTemplateScopeSection
          tenantId={tenantId}
          scopeType="COMPANY"
          scopeId={tenantId}
          title="Domyślne szablony firmy"
          description="Stosowane, gdy brak przypisania w serii, magazynie lub module."
          kinds={COMPANY_SCOPE_KINDS}
          kindAsHeading
          titleClassName="text-lg font-bold text-slate-900"
        />
      </section>

      <div className="flex justify-end pb-2">
        <PrimaryButton type="button" disabled={!profileDirty || profileSaving} onClick={() => void saveProfile()}>
          {profileSaving ? "Zapisywanie…" : "Zapisz zmiany"}
        </PrimaryButton>
      </div>
    </div>
  );
}
