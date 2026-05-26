import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  createManufacturer,
  getManufacturer,
  listManufacturerSuppliers,
  updateManufacturer,
  type ManufacturerDetailRead,
  type ManufacturerSupplierBrief,
} from "../../api/manufacturersApi";
import { SUPPLIER_COUNTRIES, SUPPLIER_COUNTRY_VALUES } from "../../constants/supplierTaxonomy";
import { taxIdValidationMessage } from "../../utils/taxIdOptional";

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

type EditTab = "basic" | "address" | "contact" | "mproducts" | "msuppliers" | "stats" | "gpsr";

type Props = {
  open: boolean;
  tenantId: number;
  manufacturerId: number | null;
  onClose: () => void;
  onSaved: () => void;
};

export function ManufacturerEditModal({ open, tenantId, manufacturerId, onClose, onSaved }: Props) {
  const isNew = manufacturerId == null;
  const [tab, setTab] = useState<EditTab>("basic");
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

  const fieldLabel = "mb-1 block text-sm font-medium text-slate-700";
  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:border-violet-400 focus:ring-2 focus:ring-violet-500";

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
    setTab("basic");
  }, []);

  useEffect(() => {
    if (!open) return;
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
  }, [open, isNew, manufacturerId, tenantId, reset]);

  useEffect(() => {
    if (!open || isNew || manufacturerId == null || tab !== "msuppliers") return;
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
  }, [open, isNew, manufacturerId, tenantId, tab]);

  const focusLogoField = () => {
    setTab("basic");
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
      setTab("basic");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await createManufacturer({
          tenant_id: tenantId,
          ...basePayload(),
        });
      } else {
        await updateManufacturer(tenantId, manufacturerId!, basePayload());
      }
      onSaved();
      onClose();
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

  if (!open) return null;

  const tabBtn = (id: EditTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`border-b-2 px-1 pb-2 text-sm font-medium transition ${
        tab === id ? "border-violet-600 text-violet-800" : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[min(92vh,calc(100dvh-2rem))] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {isNew ? "Nowy producent" : "Edycja producenta"}
          </p>
          <h2 className="mt-1 truncate text-xl font-bold text-slate-900">{name.trim() || (isNew ? "Bez nazwy" : "—")}</h2>
          {!isNew && manufacturerId != null ? (
            <span className="mt-2 inline-flex rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-medium text-slate-800">
              ID: {manufacturerId}
            </span>
          ) : null}
        </div>

        {loadErr ? <div className="border-b border-red-100 bg-red-50 px-6 py-2 text-sm text-red-800">{loadErr}</div> : null}

        <div className="shrink-0 border-b border-slate-100 bg-white px-6 pt-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {tabBtn("basic", "Podstawowe")}
            {tabBtn("address", "Adres")}
            {tabBtn("contact", "Kontakt")}
            {tabBtn("mproducts", "Produkty")}
            {tabBtn("msuppliers", "Dostawcy")}
            {tabBtn("stats", "Statystyki")}
            {tabBtn("gpsr", "GPSR")}
          </div>
        </div>

        <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            {tab === "basic" && (
              <div className="space-y-6 lg:grid lg:grid-cols-[1fr_220px] lg:items-start lg:gap-6">
                <div className="space-y-6">
                  <Card title="Podstawowe">
                    <div>
                      <label className={fieldLabel}>Krótka nazwa (lista, wyszukiwarka) *</label>
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
                    </div>
                    <div>
                      <label className={fieldLabel}>Pełna nazwa firmy</label>
                      <input
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className={inputClass}
                        placeholder="np. nazwa prawna na fakturze"
                      />
                    </div>
                    <div>
                      <label className={fieldLabel}>NIP</label>
                      <input type="text" value={taxId} onChange={(e) => setTaxId(e.target.value)} className={inputClass} placeholder="opcjonalnie" />
                    </div>
                    <div>
                      <label className={fieldLabel}>URL logo</label>
                      <input
                        ref={logoUrlInputRef}
                        type="url"
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        className={inputClass}
                        placeholder="https://…"
                      />
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-violet-600"
                        checked={active}
                        onChange={(e) => setActive(e.target.checked)}
                      />
                      Aktywny
                    </label>
                  </Card>
                </div>

                <aside className="min-h-0 lg:sticky lg:top-0">
                  {logoUrl.trim() ? (
                    <Card title="Logo">
                      <button
                        type="button"
                        onClick={focusLogoField}
                        title="Edytuj adres URL logo"
                        className="mx-auto block w-full rounded-lg p-1 transition hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                      >
                        <img src={logoUrl.trim()} alt="" className="mx-auto max-h-32 rounded-lg object-contain" />
                      </button>
                      <p className="text-center text-xs text-slate-500">Kliknij, aby przejść do pola URL</p>
                    </Card>
                  ) : null}
                </aside>
              </div>
            )}

            {tab === "address" && (
              <Card title="Adres">
                <div>
                  <label className={fieldLabel}>Kraj</label>
                  <select className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)}>
                    <option value="">—</option>
                    {SUPPLIER_COUNTRIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                    {country && !SUPPLIER_COUNTRY_VALUES.has(country) ? (
                      <option value={country}>{country} (zapis spoza listy — wybierz kraj z listy i zapisz)</option>
                    ) : null}
                  </select>
                </div>
                <div>
                  <label className={fieldLabel}>Miasto</label>
                  <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={fieldLabel}>Kod pocztowy</label>
                  <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={fieldLabel}>Ulica i numer</label>
                  <textarea className={`${inputClass} min-h-[72px]`} value={street} onChange={(e) => setStreet(e.target.value)} />
                </div>
              </Card>
            )}

            {tab === "contact" && (
              <Card title="Kontakt">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={fieldLabel}>Strona WWW</label>
                    <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={fieldLabel}>E-mail</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className={fieldLabel}>Telefon</label>
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
                </div>
              </Card>
            )}

            {tab === "mproducts" &&
              (isNew ? (
                <Card title="Produkty">
                  <p className="text-sm text-slate-600">Zapisz producenta, aby zobaczyć produkty przypisane w katalogu.</p>
                </Card>
              ) : detail != null ? (
                <Card title={`Produkty producenta (${detail.product_count})`}>
                  <p className="text-xs text-slate-500">
                    Produkty z polem wskazującym na tego producenta. Łańcuch dostaw: Producent →
                    Produkt → Dostawca (zakładka Dostawcy).
                  </p>
                  <Link
                    to={`/products/list?manufacturer_id=${manufacturerId}&tenant_id=${tenantId}`}
                    className="inline-flex text-sm font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
                    onClick={onClose}
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
                </Card>
              ) : (
                <p className="text-sm text-slate-500">Ładowanie…</p>
              ))}

            {tab === "msuppliers" &&
              (isNew ? (
                <Card title="Dostawcy">
                  <p className="text-sm text-slate-600">Zapisz producenta, aby zobaczyć dostawców oferujących jego produkty.</p>
                </Card>
              ) : (
                <Card title="Dostawcy powiązani przez produkty">
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
                                  to={`/suppliers?edit=${s.supplier_id}&tenant_id=${tenantId}`}
                                  className="text-xs font-medium text-violet-700 hover:underline"
                                  onClick={onClose}
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
                </Card>
              ))}

            {tab === "stats" &&
              (isNew ? (
                <Card title="Statystyki">
                  <p className="text-sm text-slate-600">Zapisz producenta, aby zobaczyć statystyki i listę produktów.</p>
                </Card>
              ) : detail != null ? (
                <div className="space-y-6">
                  <Card title="Statystyki">
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
                  </Card>
                  <p className="text-xs text-slate-500">
                    Listę produktów i powiązanych dostawców zobaczysz w zakładkach <span className="font-medium">Produkty</span> i{" "}
                    <span className="font-medium">Dostawcy</span>.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Ładowanie statystyk…</p>
              ))}

            {tab === "gpsr" && (
              <Card title="GPSR — osoba odpowiedzialna (domyślnie dla produktów)">
                <p className="text-xs text-slate-500">
                  Produkty mogą nadpisać te dane w polach „Osoba odpowiedzialna” / e-mail w karcie produktu (metadane).
                </p>
                <div>
                  <label className={fieldLabel}>Imię i nazwisko</label>
                  <input type="text" value={respName} onChange={(e) => setRespName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={fieldLabel}>E-mail</label>
                  <input type="email" value={respEmail} onChange={(e) => setRespEmail(e.target.value)} className={inputClass} />
                </div>
              </Card>
            )}

            {saveErr ? <p className="mt-4 text-sm text-red-600">{saveErr}</p> : null}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-50">
              Anuluj
            </button>
            <button
              type="submit"
              disabled={saving || !!loadErr}
              className="rounded-lg bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {saving ? "Zapisywanie…" : isNew ? "Utwórz" : "Zapisz"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
