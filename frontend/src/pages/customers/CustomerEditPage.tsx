import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { PanelBulkStatusConfirmModal } from "../../components/orders/panelList/PanelBulkStatusConfirmModal";
import CountryCodeSelect from "../../components/customers/CountryCodeSelect";
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  patchCustomer,
  type CustomerAddressDto,
  type CustomerDetail,
  type CustomerProductDiscountDto,
} from "../../api/customersApi";
import { getShippingMethods } from "../../api/shippingMethodsApi";
import { isSuperRole } from "../../auth/isSuperRole";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { useWarehouse } from "../../context/WarehouseContext";
import { CustomerDetailPageShell } from "./CustomerDetailPageShell";
import { CustomerGusBadges } from "../../components/customers/CustomerGusBadges";
import { CustomerGusLookupPanel } from "../../components/customers/CustomerGusLookupPanel";
import { useCustomerGusLookup } from "../../hooks/customers/useCustomerGusLookup";
import { applyGusToCustomerForm } from "../../utils/applyGusToCustomerForm";
import { getCustomerDisplayName } from "../../utils/getCustomerDisplayName";
import { validatePolishNipChecksum } from "../../utils/polishNip";

const PAYMENT_PRESETS = ["przelew", "pobranie", "BLIK", "karta", "gotówka"] as const;

const MAIN_CARD_CLASS =
  "space-y-6";

const ADDRESS_SHELL_CLASS = "rounded-lg bg-slate-100/40 p-4";

const inp =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

const sectionTitleClass = "text-sm font-bold text-slate-800";

function emptyAddress(): CustomerAddressDto {
  return {
    first_name: "",
    last_name: "",
    company_name: "",
    street: "",
    house_number: "",
    apartment_number: "",
    postal_code: "",
    city: "",
    country_code: "PL",
    is_default: false,
  };
}

export default function CustomerEditPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const { user, hasPermission } = useAuth();
  const warehouseId = warehouse?.id ?? null;
  const tenantId = DAMAGE_TENANT_ID;
  const isNew = idParam === "new" || !idParam;
  const canOverwriteGus = hasPermission("settings.users") || isSuperRole(user?.role ?? "");

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [gusOverwriteOpen, setGusOverwriteOpen] = useState(false);
  const [shippingOpts, setShippingOpts] = useState<{ id: string; name: string }[]>([]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [nip, setNip] = useState("");
  const [countryCode, setCountryCode] = useState("PL");
  const [docType, setDocType] = useState<"RECEIPT" | "INVOICE">("RECEIPT");
  const [shipMethodId, setShipMethodId] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [globalDisc, setGlobalDisc] = useState(0);
  const [addresses, setAddresses] = useState<CustomerAddressDto[]>([emptyAddress()]);
  const [discounts, setDiscounts] = useState<CustomerProductDiscountDto[]>([]);
  const [newDiscProductId, setNewDiscProductId] = useState("");
  const [newDiscPct, setNewDiscPct] = useState("0");

  const gus = useCustomerGusLookup(nip, tenantId);

  const applyGusData = (overwrite = false) => {
    if (!gus.result?.ok || !gus.result.found) return;
    const next = applyGusToCustomerForm(gus.result, { companyName, nip, addresses }, overwrite);
    setCompanyName(next.companyName);
    setNip(next.nip);
    setAddresses(next.addresses);
    gus.markApplied();
  };

  const applyDetail = useCallback((d: CustomerDetail) => {
    setFirstName(d.first_name ?? "");
    setLastName(d.last_name ?? "");
    setPhone(d.phone ?? "");
    setEmail(d.email ?? "");
    setCompanyName(d.company_name ?? "");
    setNip(d.nip ?? "");
    setCountryCode(d.country_code || "PL");
    setDocType(d.default_document_type === "INVOICE" ? "INVOICE" : "RECEIPT");
    setShipMethodId(d.preferred_shipping_method_id?.trim() ?? "");
    setPayMethod(d.preferred_payment_method?.trim() ?? "");
    setGlobalDisc(Number(d.global_discount_percent) || 0);
    setAddresses(d.addresses?.length ? d.addresses : [emptyAddress()]);
    setDiscounts(d.product_discounts ?? []);
  }, []);

  useEffect(() => {
    if (warehouseId == null) {
      setShippingOpts([]);
      return;
    }
    void getShippingMethods({ tenant_id: tenantId, warehouse_id: warehouseId, active_only: false })
      .then((list) => setShippingOpts(list.map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => setShippingOpts([]));
  }, [tenantId, warehouseId]);

  useEffect(() => {
    if (isNew || !idParam || !/^\d+$/.test(idParam)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    void getCustomer(Number(idParam), tenantId)
      .then(applyDetail)
      .catch(() => setErr("Nie znaleziono klienta."))
      .finally(() => setLoading(false));
  }, [isNew, idParam, tenantId, applyDetail]);

  const setDefaultAddress = (idx: number) => {
    setAddresses((prev) => prev.map((a, i) => ({ ...a, is_default: i === idx })));
  };

  const updateAddress = (idx: number, patch: Partial<CustomerAddressDto>) => {
    setAddresses((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };

  const addAddress = () => setAddresses((prev) => [...prev, emptyAddress()]);

  const removeAddress = (idx: number) => {
    setAddresses((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const addDiscountRow = () => {
    const pid = parseInt(newDiscProductId, 10);
    const pct = parseFloat(newDiscPct.replace(",", "."));
    if (!Number.isFinite(pid) || pid < 1) {
      setErr("Podaj poprawne ID produktu.");
      return;
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setErr("Rabat musi być 0–100%.");
      return;
    }
    setErr(null);
    if (discounts.some((d) => d.product_id === pid)) {
      setDiscounts((prev) => prev.map((d) => (d.product_id === pid ? { ...d, discount_percent: pct } : d)));
    } else {
      setDiscounts((prev) => [...prev, { product_id: pid, discount_percent: pct }]);
    }
    setNewDiscProductId("");
    setNewDiscPct("0");
  };

  const removeDiscount = (pid: number) => setDiscounts((prev) => prev.filter((d) => d.product_id !== pid));

  const payloadBase = useMemo(
    () => ({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      company_name: companyName.trim() || null,
      nip: nip.trim() || null,
      country_code: countryCode.trim().toUpperCase() || "PL",
      default_document_type: docType,
      preferred_shipping_method_id: shipMethodId.trim() || null,
      preferred_payment_method: payMethod.trim() || null,
      global_discount_percent: globalDisc,
      addresses: addresses.map((a) => ({
        first_name: a.first_name.trim(),
        last_name: a.last_name.trim(),
        company_name: a.company_name?.trim() || null,
        street: a.street.trim(),
        house_number: a.house_number.trim(),
        apartment_number: a.apartment_number?.trim() || null,
        postal_code: a.postal_code.trim(),
        city: a.city.trim(),
        country_code: (a.country_code || "PL").trim().toUpperCase(),
        is_default: !!a.is_default,
      })),
      product_discounts: discounts.map((d) => ({
        product_id: d.product_id,
        discount_percent: d.discount_percent,
      })),
    }),
    [
      firstName,
      lastName,
      phone,
      email,
      companyName,
      nip,
      countryCode,
      docType,
      shipMethodId,
      payMethod,
      globalDisc,
      addresses,
      discounts,
    ],
  );

  const onSave = async () => {
    if (!firstName.trim() && !lastName.trim() && !companyName.trim()) {
      setErr("Uzupełnij imię i nazwisko lub nazwę firmy.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (isNew) {
        const created = await createCustomer({
          tenant_id: tenantId,
          ...payloadBase,
        });
        navigate(`/customers/${created.id}`, { replace: true });
      } else if (idParam && /^\d+$/.test(idParam)) {
        await patchCustomer(Number(idParam), tenantId, payloadBase);
        navigate("/customers");
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? "")
          : "";
      setErr(msg || "Zapis nie powiódł się.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteCustomer = async () => {
    if (isNew || !idParam) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await deleteCustomer(Number(idParam), tenantId);
      if (res.errors?.length) {
        setErr(res.errors.join(" "));
        setDeleteModalOpen(false);
      } else {
        setDeleteModalOpen(false);
        navigate("/customers");
      }
    } catch {
      setErr("Nie udało się usunąć klienta.");
      setDeleteModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const customerIdNum = !isNew && idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const breadcrumbTitle = isNew
    ? "Nowy klient"
    : loading
      ? "Klient"
      : getCustomerDisplayName({
          id: customerIdNum,
          company_name: companyName,
          first_name: firstName,
          last_name: lastName,
          email,
        });

  if (warehouseId == null) {
    return (
      <CustomerDetailPageShell customerId={customerIdNum} title={breadcrumbTitle} showTabs={!isNew}>
        <p className="text-sm text-amber-800">Wybierz magazyn w nagłówku — potrzebny do listy metod dostawy.</p>
      </CustomerDetailPageShell>
    );
  }

  return (
    <CustomerDetailPageShell customerId={customerIdNum} title={breadcrumbTitle} showTabs={!isNew}>
      <div className={MAIN_CARD_CLASS}>
          {loading && !isNew ? (
            <p className="text-sm text-slate-500">Ładowanie…</p>
          ) : null}

          {err ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{err}</p>
          ) : null}

          {!loading ? (
            <>
              <section>
                <h2 className={sectionTitleClass}>Dane do dokumentu</h2>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Imię
                    <input className={inp} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Nazwisko
                    <input className={inp} value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Telefon
                    <input className={inp} value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    E-mail
                    <input type="email" className={inp} value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                    Nazwa firmy (opcjonalnie)
                    <input className={inp} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                    NIP (opcjonalnie)
                    <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-start">
                      <input
                        className={`${inp} sm:max-w-xs`}
                        value={nip}
                        onChange={(e) => setNip(e.target.value)}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="000-000-00-00"
                      />
                      <button
                        type="button"
                        onClick={() => gus.fetchManual()}
                        disabled={!validatePolishNipChecksum(nip) || gus.loading}
                        className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {gus.loading ? (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden />
                        ) : null}
                        Pobierz z GUS
                      </button>
                    </div>
                    {gus.result && !gus.applied ? <div className="mt-2"><CustomerGusBadges result={gus.result} /></div> : null}
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Kraj (kod)
                    <div className="mt-1">
                      <CountryCodeSelect value={countryCode} onChange={setCountryCode} className={inp} />
                    </div>
                  </label>
                </div>
                {gus.result && !gus.applied ? (
                  <div className="mt-4">
                    <CustomerGusLookupPanel
                      result={gus.result}
                      loading={gus.loading}
                      error={gus.error}
                      onApply={() => applyGusData(false)}
                      canOverwrite={canOverwriteGus}
                      onApplyOverwrite={() => setGusOverwriteOpen(true)}
                      onDismiss={gus.clearResult}
                    />
                  </div>
                ) : gus.loading && !gus.result ? (
                  <div className="mt-4">
                    <CustomerGusLookupPanel
                      result={null}
                      loading
                      error={null}
                      onApply={() => applyGusData(false)}
                      onDismiss={gus.clearResult}
                    />
                  </div>
                ) : gus.error && !gus.result ? (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                    {gus.error}
                  </p>
                ) : null}
              </section>

              <section>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className={sectionTitleClass}>Adresy dostawy</h2>
                  <button
                    type="button"
                    onClick={addAddress}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  >
                    + Dodaj adres
                  </button>
                </div>
                <div className="mt-3 space-y-4">
                  {addresses.map((a, idx) => (
                    <div key={idx} className={ADDRESS_SHELL_CLASS}>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="radio"
                            name="defaddr"
                            checked={!!a.is_default}
                            onChange={() => setDefaultAddress(idx)}
                          />
                          Domyślny adres dostawy
                        </label>
                        {addresses.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeAddress(idx)}
                            className="text-sm text-red-600 hover:underline"
                          >
                            Usuń
                          </button>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label className="block text-sm font-medium text-slate-700">
                          Imię
                          <input
                            className={inp}
                            value={a.first_name}
                            onChange={(e) => updateAddress(idx, { first_name: e.target.value })}
                          />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                          Nazwisko
                          <input
                            className={inp}
                            value={a.last_name}
                            onChange={(e) => updateAddress(idx, { last_name: e.target.value })}
                          />
                        </label>
                        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                          Firma (opcjonalnie)
                          <input
                            className={inp}
                            value={a.company_name ?? ""}
                            onChange={(e) => updateAddress(idx, { company_name: e.target.value })}
                          />
                        </label>
                        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                          Ulica
                          <input
                            className={inp}
                            value={a.street}
                            onChange={(e) => updateAddress(idx, { street: e.target.value })}
                          />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                          Nr domu
                          <input
                            className={inp}
                            value={a.house_number}
                            onChange={(e) => updateAddress(idx, { house_number: e.target.value })}
                          />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                          Nr lokalu
                          <input
                            className={inp}
                            value={a.apartment_number ?? ""}
                            onChange={(e) => updateAddress(idx, { apartment_number: e.target.value })}
                          />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                          Kod pocztowy
                          <input
                            className={inp}
                            value={a.postal_code}
                            onChange={(e) => updateAddress(idx, { postal_code: e.target.value })}
                          />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                          Miasto
                          <input
                            className={inp}
                            value={a.city}
                            onChange={(e) => updateAddress(idx, { city: e.target.value })}
                          />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                          Kraj
                          <div className="mt-1">
                            <CountryCodeSelect
                              value={a.country_code}
                              onChange={(code) => updateAddress(idx, { country_code: code })}
                              className={inp}
                            />
                          </div>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h2 className={sectionTitleClass}>Rabaty</h2>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Rabat globalny (%)
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className={inp}
                      value={globalDisc}
                      onChange={(e) => setGlobalDisc(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                    />
                  </label>
                </div>
                <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Rabaty per produkt</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    className={`${inp} max-w-[8rem]`}
                    placeholder="ID produktu"
                    value={newDiscProductId}
                    onChange={(e) => setNewDiscProductId(e.target.value)}
                  />
                  <input
                    className={`${inp} max-w-[6rem]`}
                    placeholder="%"
                    value={newDiscPct}
                    onChange={(e) => setNewDiscPct(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={addDiscountRow}
                    className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200"
                  >
                    Dodaj / aktualizuj
                  </button>
                </div>
                {discounts.length > 0 ? (
                  <table className="mt-4 w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="py-2">Produkt</th>
                        <th className="py-2">Rabat %</th>
                        <th className="w-16" />
                      </tr>
                    </thead>
                    <tbody>
                      {discounts.map((d) => (
                        <tr key={d.product_id} className="border-b border-slate-100">
                          <td className="py-2">
                            #{d.product_id}{" "}
                            {(d.product_name || d.product_sku) && (
                              <span className="text-slate-500">
                                — {d.product_name || ""} {d.product_sku ? `(${d.product_sku})` : ""}
                              </span>
                            )}
                          </td>
                          <td className="py-2 tabular-nums">{Number(d.discount_percent).toFixed(1)}</td>
                          <td className="py-2">
                            <button
                              type="button"
                              className="text-red-600 hover:underline"
                              onClick={() => removeDiscount(d.product_id)}
                            >
                              Usuń
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">Brak rabatów per produkt.</p>
                )}
              </section>

              <section>
                <h2 className={sectionTitleClass}>Dostawa i płatność</h2>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Typ dokumentu (preferencja)
                    <select className={inp} value={docType} onChange={(e) => setDocType(e.target.value as "RECEIPT" | "INVOICE")}>
                      <option value="RECEIPT">Paragon</option>
                      <option value="INVOICE">Faktura</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Metoda dostawy
                    <select className={inp} value={shipMethodId} onChange={(e) => setShipMethodId(e.target.value)}>
                      <option value="">— brak —</option>
                      {shippingOpts.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                    Metoda płatności
                    <select className={inp} value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                      <option value="">—</option>
                      {Array.from(new Set([...PAYMENT_PRESETS, payMethod].filter(Boolean))).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void onSave()}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? "Zapisywanie…" : "Zapisz"}
                </button>
                {!isNew ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setDeleteModalOpen(true)}
                    className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Usuń klienta
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

      <PanelBulkStatusConfirmModal
        open={gusOverwriteOpen}
        title="Nadpisać dane z GUS?"
        message="Istniejące pola formularza zostaną zastąpione danymi z rejestru."
        subMessage="Tej operacji nie można cofnąć automatycznie — zapisz klienta dopiero po weryfikacji."
        confirmLabel="Nadpisz dane"
        onCancel={() => setGusOverwriteOpen(false)}
        onConfirm={() => {
          applyGusData(true);
          setGusOverwriteOpen(false);
        }}
      />

      <PanelBulkStatusConfirmModal
        open={deleteModalOpen}
        variant="danger"
        title="Usuń klienta"
        message="Czy na pewno usunąć?"
        subMessage="Powiązane rekordy zostaną zarchiwizowane."
        confirmLabel="Usuń"
        busy={saving}
        onCancel={() => {
          if (!saving) setDeleteModalOpen(false);
        }}
        onConfirm={() => void confirmDeleteCustomer()}
      />
    </CustomerDetailPageShell>
  );
}
