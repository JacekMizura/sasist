import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  createManufacturer,
  getManufacturer,
  listManufacturerSuppliers,
  updateManufacturer,
  type ManufacturerDetailRead,
  type ManufacturerSupplierBrief,
} from "../../api/manufacturersApi";
import { AssortmentEntityPageShell } from "../../components/assortment/AssortmentEntityPageShell";
import { SUPPLIER_COUNTRIES, SUPPLIER_COUNTRY_VALUES } from "../../constants/supplierTaxonomy";
import {
  brandLinkButtonClass,
  brandLinkTextClass,
  Checkbox,
  FormField,
  FormSection,
  FORM_FIELD_DENSITY,
  formStackClass,
  Input,
  PrimaryButton,
  SecondaryButton,
  Select,
  Textarea,
} from "../../design-system";
import {
  manufacturerDetailTabs,
  parseManufacturerEditTab,
  type ManufacturerEditTab,
} from "../../modules/manufacturers/manufacturerDetailTabs";
import { taxIdValidationMessage } from "../../utils/taxIdOptional";

export default function ManufacturerEditPage() {
  const navigate = useNavigate();
  const { manufacturerId: idParam, tab: tabParam } = useParams<{ manufacturerId?: string; tab?: string }>();
  const [searchParams] = useSearchParams();
  const tenantId = useMemo(() => {
    const tid = Number(searchParams.get("tenant_id"));
    return Number.isFinite(tid) && tid >= 1 ? tid : 1;
  }, [searchParams]);

  const isNew = idParam == null || idParam === "new";
  const manufacturerId = !isNew && idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;
  const tab = parseManufacturerEditTab(tabParam) as ManufacturerEditTab;
  const entityKey = isNew ? ("new" as const) : manufacturerId!;
  const logoUrlInputRef = useRef<HTMLInputElement>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [street, setStreet] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [active, setActive] = useState(true);
  const [respName, setRespName] = useState("");
  const [respEmail, setRespEmail] = useState("");

  const [detail, setDetail] = useState<ManufacturerDetailRead | null>(null);
  const [mfgSuppliers, setMfgSuppliers] = useState<ManufacturerSupplierBrief[]>([]);
  const [mfgSuppliersLoading, setMfgSuppliersLoading] = useState(false);
  const [mfgSuppliersErr, setMfgSuppliersErr] = useState<string | null>(null);

  const reset = useCallback(() => {
    setLoadErr(null);
    setSaveErr(null);
    setName("");
    setCompanyName("");
    setTaxId("");
    setLogoUrl("");
    setCountry("");
    setCity("");
    setPostalCode("");
    setStreet("");
    setWebsite("");
    setEmail("");
    setPhone("");
    setActive(true);
    setRespName("");
    setRespEmail("");
    setDetail(null);
    setMfgSuppliers([]);
    setMfgSuppliersErr(null);
  }, []);

  useEffect(() => {
    if (isNew) {
      reset();
      return;
    }
    let cancelled = false;
    setLoadErr(null);
    void (async () => {
      try {
        const d = await getManufacturer(tenantId, manufacturerId!, 500);
        if (cancelled) return;
        setDetail(d);
        setName(d.name);
        setCompanyName(d.company_name ?? "");
        setTaxId(d.tax_id ?? "");
        setLogoUrl(d.logo_url ?? "");
        setCountry(d.country ?? "");
        setCity(d.city ?? "");
        setPostalCode(d.postal_code ?? "");
        setStreet(d.street ?? "");
        setWebsite(d.website ?? "");
        setEmail(d.email ?? "");
        setPhone(d.phone ?? "");
        setActive(d.active);
        setRespName(d.responsible_person_name ?? "");
        setRespEmail(d.responsible_person_email ?? "");
      } catch {
        if (!cancelled) setLoadErr("Nie udało się wczytać producenta.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, manufacturerId, tenantId, reset]);

  useEffect(() => {
    if (isNew || manufacturerId == null || tab !== "msuppliers") return;
    let cancelled = false;
    setMfgSuppliersLoading(true);
    setMfgSuppliersErr(null);
    void listManufacturerSuppliers(tenantId, manufacturerId)
      .then((rows) => {
        if (!cancelled) setMfgSuppliers(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setMfgSuppliersErr("Nie udało się wczytać dostawców powiązanych z produktami tego producenta.");
          setMfgSuppliers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setMfgSuppliersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, manufacturerId, tenantId, tab]);

  const listHref = tenantId >= 1 ? `/manufacturers?tenant_id=${tenantId}` : "/manufacturers";

  const focusLogoField = () => {
    const basicHref = isNew
      ? `/manufacturers/new?tenant_id=${tenantId}`
      : `/manufacturers/${manufacturerId}?tenant_id=${tenantId}`;
    void navigate(basicHref);
    window.setTimeout(() => logoUrlInputRef.current?.focus(), 0);
  };

  const basePayload = () => ({
    name: name.trim(),
    company_name: companyName.trim() || null,
    tax_id: taxId.trim() || null,
    logo_url: logoUrl.trim() || null,
    country: country.trim() || null,
    city: city.trim() || null,
    postal_code: postalCode.trim() || null,
    street: street.trim() || null,
    website: website.trim() || null,
    email: email.trim() || null,
    phone: phone.trim() || null,
    active,
    responsible_person_name: respName.trim() || null,
    responsible_person_email: respEmail.trim() || null,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveErr(null);
    const nm = name.trim();
    if (!nm) {
      setSaveErr("Nazwa jest wymagana.");
      return;
    }
    const taxErr = taxIdValidationMessage(taxId);
    if (taxErr) {
      setSaveErr(taxErr);
      void navigate(isNew ? `/manufacturers/new?tenant_id=${tenantId}` : `/manufacturers/${manufacturerId}?tenant_id=${tenantId}`);
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await createManufacturer({
          tenant_id: tenantId,
          ...basePayload(),
        });
        void navigate(`/manufacturers/${created.id}?tenant_id=${tenantId}`, { replace: true });
      } else {
        await updateManufacturer(tenantId, manufacturerId!, basePayload());
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? String((err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? "")
          : "";
      setSaveErr(msg || "Zapis nie powiódł się.");
    } finally {
      setSaving(false);
    }
  };

  if (!isNew && manufacturerId == null) {
    return (
      <AssortmentEntityPageShell
        breadcrumbs={[
          { label: "Asortyment", to: "/products/list" },
          { label: "Producenci", to: listHref },
          { label: "Nie znaleziono" },
        ]}
        title="Producent"
        backTo={listHref}
        backLabel="Lista producentów"
      >
        <p className="text-sm text-slate-600">Nieprawidłowy identyfikator producenta.</p>
      </AssortmentEntityPageShell>
    );
  }

  const pageTitle = name.trim() || (isNew ? "Nowy producent" : "Producent");
  const breadcrumbTail = isNew ? "Nowy producent" : name.trim() || `#${manufacturerId}`;

  const saveFooter = (
    <div className="flex flex-wrap justify-end gap-2">
      <SecondaryButton type="button" onClick={() => void navigate(listHref)}>
        Anuluj
      </SecondaryButton>
      <PrimaryButton type="submit" form="manufacturer-edit-form" disabled={saving || !!loadErr}>
        {saving ? "Zapisywanie…" : isNew ? "Utwórz" : "Zapisz"}
      </PrimaryButton>
    </div>
  );

  return (
    <AssortmentEntityPageShell
      breadcrumbs={[
        { label: "Asortyment", to: "/products/list" },
        { label: "Producenci", to: listHref },
        { label: breadcrumbTail },
      ]}
      title={pageTitle}
      subtitle={isNew ? "Utwórz nowego producenta" : `ID: ${manufacturerId}`}
      backTo={listHref}
      backLabel="Lista producentów"
      tabs={manufacturerDetailTabs(entityKey, tenantId)}
      footer={saveFooter}
    >
      {loadErr ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadErr}</div> : null}

      <form id="manufacturer-edit-form" className={formStackClass} onSubmit={handleSubmit}>
        <div className="min-w-0">
            {tab === "basic" && (
              <div className="space-y-6 lg:grid lg:grid-cols-[1fr_220px] lg:items-start lg:gap-6">
                <div className="space-y-6">
                  <FormSection title="Podstawowe">
                    <div className={formStackClass}>
                      <FormField label="Krótka nazwa (lista, wyszukiwarka) *">
                        <Input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          density={FORM_FIELD_DENSITY}
                          focusTone="brand"
                        />
                      </FormField>
                      <FormField label="Pełna nazwa firmy">
                        <Input
                          type="text"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="np. nazwa prawna na fakturze"
                          density={FORM_FIELD_DENSITY}
                          focusTone="brand"
                        />
                      </FormField>
                      <FormField label="NIP">
                        <Input
                          type="text"
                          value={taxId}
                          onChange={(e) => setTaxId(e.target.value)}
                          placeholder="opcjonalnie"
                          density={FORM_FIELD_DENSITY}
                          focusTone="brand"
                        />
                      </FormField>
                      <FormField label="URL logo">
                        <Input
                          ref={logoUrlInputRef}
                          type="url"
                          value={logoUrl}
                          onChange={(e) => setLogoUrl(e.target.value)}
                          placeholder="https://…"
                          density={FORM_FIELD_DENSITY}
                          focusTone="brand"
                        />
                      </FormField>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} />
                        Aktywny
                      </label>
                    </div>
                  </FormSection>
                </div>

                <aside className="min-h-0 lg:sticky lg:top-0">
                  {logoUrl.trim() ? (
                    <FormSection title="Logo">
                      <button
                        type="button"
                        onClick={focusLogoField}
                        title="Edytuj adres URL logo"
                        className="mx-auto block w-full rounded-lg p-1 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50"
                      >
                        <img src={logoUrl.trim()} alt="" className="mx-auto max-h-32 rounded-lg object-contain" />
                      </button>
                      <p className="text-center text-xs text-slate-500">Kliknij, aby przejść do pola URL</p>
                    </FormSection>
                  ) : null}
                </aside>
              </div>
            )}

            {tab === "address" && (
              <FormSection title="Adres">
                <div className={formStackClass}>
                  <FormField label="Kraj">
                    <Select
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      density={FORM_FIELD_DENSITY}
                      focusTone="brand"
                      className="bg-white"
                    >
                      <option value="">—</option>
                      {SUPPLIER_COUNTRIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                      {country && !SUPPLIER_COUNTRY_VALUES.has(country) ? (
                        <option value={country}>{country} (zapis spoza listy — wybierz kraj z listy i zapisz)</option>
                      ) : null}
                    </Select>
                  </FormField>
                  <FormField label="Miasto">
                    <Input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      density={FORM_FIELD_DENSITY}
                      focusTone="brand"
                    />
                  </FormField>
                  <FormField label="Kod pocztowy">
                    <Input
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      density={FORM_FIELD_DENSITY}
                      focusTone="brand"
                    />
                  </FormField>
                  <FormField label="Ulica i numer">
                    <Textarea
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      rows={3}
                      density={FORM_FIELD_DENSITY}
                      focusTone="brand"
                    />
                  </FormField>
                </div>
              </FormSection>
            )}

            {tab === "contact" && (
              <FormSection title="Kontakt">
                <div className={formStackClass}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormField label="Strona WWW">
                      <Input
                        type="url"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        density={FORM_FIELD_DENSITY}
                        focusTone="brand"
                      />
                    </FormField>
                    <FormField label="E-mail">
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        density={FORM_FIELD_DENSITY}
                        focusTone="brand"
                      />
                    </FormField>
                  </div>
                  <FormField label="Telefon">
                    <Input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      density={FORM_FIELD_DENSITY}
                      focusTone="brand"
                    />
                  </FormField>
                </div>
              </FormSection>
            )}

            {tab === "mproducts" &&
              (isNew ? (
                <FormSection title="Produkty">
                  <p className="text-sm text-slate-600">Zapisz producenta, aby zobaczyć produkty przypisane w katalogu.</p>
                </FormSection>
              ) : detail != null ? (
                <FormSection title={`Produkty producenta (${detail.product_count})`}>
                  <p className="text-xs text-slate-500">
                    Produkty z polem wskazującym na tego producenta. Łańcuch dostaw: Producent →
                    Produkt → Dostawca (zakładka Dostawcy).
                  </p>
                  <Link
                    to={`/products/list?manufacturer_id=${manufacturerId}&tenant_id=${tenantId}`}
                    className={`inline-flex text-sm underline underline-offset-2 decoration-orange-200 ${brandLinkTextClass}`}
                  >
                    Otwórz pełną listę w module Produkty →
                  </Link>
                  {detail.products.length === 0 ? (
                    <p className="text-sm text-slate-600">Brak przypisanych produktów.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left">
                          <tr>
                            <th className="px-3 py-2">Nazwa</th>
                            <th className="px-3 py-2">SKU</th>
                            <th className="px-3 py-2">EAN</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.products.map((p) => (
                            <tr key={p.id} className="border-t border-slate-100">
                              <td className="px-3 py-2 font-medium text-slate-900">{p.name?.trim() || `#${p.id}`}</td>
                              <td className="px-3 py-2 text-slate-600">{(p.symbol || "").trim() || "—"}</td>
                              <td className="px-3 py-2 text-slate-600">{(p.ean || "").trim() || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </FormSection>
              ) : (
                <p className="text-sm text-slate-500">Ładowanie…</p>
              ))}

            {tab === "msuppliers" &&
              (isNew ? (
                <FormSection title="Dostawcy">
                  <p className="text-sm text-slate-600">Zapisz producenta, aby zobaczyć dostawców oferujących jego produkty.</p>
                </FormSection>
              ) : (
                <FormSection title="Dostawcy powiązani przez produkty">
                  <p className="text-xs text-slate-500">
                    Dostawcy mający w ofercie co najmniej jeden produkt tego producenta.
                  </p>
                  {mfgSuppliersErr ? <p className="text-sm text-red-600">{mfgSuppliersErr}</p> : null}
                  {mfgSuppliersLoading ? (
                    <p className="text-sm text-slate-500">Wczytywanie…</p>
                  ) : mfgSuppliers.length === 0 ? (
                    <p className="text-sm text-slate-600">Brak dostawców w ofercie dla produktów tego producenta.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left">
                          <tr>
                            <th className="px-3 py-2">Dostawca</th>
                            <th className="px-3 py-2 text-right">Produkty w ofercie</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="w-28 px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {mfgSuppliers.map((s) => (
                            <tr key={s.supplier_id} className="border-t border-slate-100">
                              <td className="px-3 py-2 font-medium text-slate-900">{s.name}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{s.linked_product_count}</td>
                              <td className="px-3 py-2">
                                {s.active ? (
                                  <span className="text-xs text-emerald-700">Aktywny</span>
                                ) : (
                                  <span className="text-xs text-slate-500">Nieaktywny</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <Link
                                  to={`/suppliers/${s.supplier_id}?tenant_id=${tenantId}`}
                                  className={brandLinkButtonClass}
                                >
                                  Edycja dostawcy
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </FormSection>
              ))}

            {tab === "stats" &&
              (isNew ? (
                <FormSection title="Statystyki">
                  <p className="text-sm text-slate-600">Zapisz producenta, aby zobaczyć statystyki i listę produktów.</p>
                </FormSection>
              ) : detail != null ? (
                <div className="space-y-6">
                  <FormSection title="Statystyki">
                    <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <dt className="text-xs font-medium text-slate-500">Liczba produktów</dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{detail.product_count}</dd>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <dt className="text-xs font-medium text-slate-500">Łączny stan magazynowy</dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                          {(detail.total_inventory_quantity ?? 0).toLocaleString("pl-PL", {
                            maximumFractionDigits: 2,
                          })}
                        </dd>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <dt className="text-xs font-medium text-slate-500">Produkty bez stanu</dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                          {detail.out_of_stock_product_count ?? 0}
                        </dd>
                      </div>
                    </dl>
                  </FormSection>
                  <p className="text-xs text-slate-500">
                    Listę produktów i powiązanych dostawców zobaczysz w zakładkach <span className="font-medium">Produkty</span> i{" "}
                    <span className="font-medium">Dostawcy</span>.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Ładowanie statystyk…</p>
              ))}

            {tab === "gpsr" && (
              <FormSection title="GPSR — osoba odpowiedzialna (domyślnie dla produktów)">
                <div className={formStackClass}>
                  <p className="text-xs text-slate-500">
                    Produkty mogą nadpisać te dane w polach „Osoba odpowiedzialna” / e-mail w karcie produktu (metadane).
                  </p>
                  <FormField label="Imię i nazwisko">
                    <Input
                      type="text"
                      value={respName}
                      onChange={(e) => setRespName(e.target.value)}
                      density={FORM_FIELD_DENSITY}
                      focusTone="brand"
                    />
                  </FormField>
                  <FormField label="E-mail">
                    <Input
                      type="email"
                      value={respEmail}
                      onChange={(e) => setRespEmail(e.target.value)}
                      density={FORM_FIELD_DENSITY}
                      focusTone="brand"
                    />
                  </FormField>
                </div>
              </FormSection>
            )}

            {saveErr ? <p className="mt-4 text-sm text-red-600">{saveErr}</p> : null}
        </div>
      </form>
    </AssortmentEntityPageShell>
  );
}
