import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../api/axios";
import {
  createSupplier,
  getSupplier,
  updateSupplier,
  type SupplierRead,
} from "../../api/inboundSuppliersApi";
import {
  createSupplierProductLink,
  deleteSupplierProductLink,
  patchSupplierProductLink,
} from "../../api/supplierProductLinksApi";
import { listSupplierProducts, type SupplierProductCatalogItem } from "../../api/supplierProductsApi";
import {
  SUPPLIER_COUNTRIES,
  SUPPLIER_COUNTRY_VALUES,
  SUPPLIER_CURRENCIES,
  type SupplierCurrencyCode,
} from "../../constants/supplierTaxonomy";
import { taxIdValidationMessage } from "../../utils/taxIdOptional";

type Props = {
  open: boolean;
  tenantId: number;
  supplierId: number | null;
  onClose: () => void;
  onSaved: () => void;
};

type Tab = "basic" | "address" | "contact" | "products";

type ProductSearchHit = {
  id: number;
  name?: string;
  symbol?: string;
  ean?: string;
  image_url?: string | null;
  purchase_price?: number | null;
};

export function SupplierEditModal({ open, tenantId, supplierId, onClose, onSaved }: Props) {
  const isNew = supplierId == null;
  const [tab, setTab] = useState<Tab>("basic");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [street, setStreet] = useState("");
  const [address, setAddress] = useState("");
  const [active, setActive] = useState(true);
  const [leadDays, setLeadDays] = useState("");
  const [currency, setCurrency] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [moq, setMoq] = useState("");
  const [freeShippingThreshold, setFreeShippingThreshold] = useState("");
  const [offersFreeShipping, setOffersFreeShipping] = useState(true);
  const [requiresMoq, setRequiresMoq] = useState(true);
  const [notes, setNotes] = useState("");

  const [links, setLinks] = useState<SupplierProductCatalogItem[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linksErr, setLinksErr] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [searchHits, setSearchHits] = useState<ProductSearchHit[]>([]);
  const [busyLink, setBusyLink] = useState(false);

  /** Zaznaczone wiersze tabeli (supplier_products.id). */
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<number>>(() => new Set());
  /** Pola masowej edycji — puste = nie zmieniaj tej kolumny przy „Zastosuj”. */
  const [bulkNetPrice, setBulkNetPrice] = useState("");
  const [bulkLeadDays, setBulkLeadDays] = useState("");
  const [bulkMoq, setBulkMoq] = useState("");
  const bulkSelectAllRef = useRef<HTMLInputElement>(null);

  /** Produkty już przypisane do tego dostawcy — nie pokazuj ich w podpowiedzi wyszukiwania. */
  const assignedProductIds = useMemo(() => new Set(links.map((l) => l.product_id)), [links]);
  const visibleSearchHits = useMemo(
    () => searchHits.filter((h) => !assignedProductIds.has(h.id)),
    [searchHits, assignedProductIds],
  );

  const fieldLabel = "mb-1 block text-sm font-medium text-slate-700";
  const inputClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:border-violet-400 focus:ring-2 focus:ring-violet-500";
  const inputTableClass =
    "w-full min-w-[4rem] rounded border border-slate-200 px-2 py-1 text-sm tabular-nums focus:border-violet-400 focus:ring-1 focus:ring-violet-500";

  const reset = useCallback(() => {
    setLoadErr(null);
    setSaveErr(null);
    setTab("basic");
    setName("");
    setCompanyName("");
    setTaxId("");
    setEmail("");
    setPhone("");
    setWebsite("");
    setCountry("");
    setCity("");
    setPostalCode("");
    setStreet("");
    setAddress("");
    setActive(true);
    setLeadDays("");
    setCurrency("");
    setMinOrder("");
    setMoq("");
    setFreeShippingThreshold("");
    setOffersFreeShipping(true);
    setRequiresMoq(true);
    setNotes("");
    setLinks([]);
    setLinksErr(null);
    setProductSearch("");
    setSearchHits([]);
    setSelectedLinkIds(new Set());
    setBulkNetPrice("");
    setBulkLeadDays("");
    setBulkMoq("");
  }, []);

  const reloadLinks = useCallback(async () => {
    if (isNew || supplierId == null) return;
    setLinksLoading(true);
    setLinksErr(null);
    try {
      const rows = await listSupplierProducts(tenantId, supplierId, { catalog_scope: "products" });
      setLinks(rows);
    } catch {
      setLinksErr("Nie udało się wczytać powiązań produktów.");
      setLinks([]);
    } finally {
      setLinksLoading(false);
    }
  }, [isNew, supplierId, tenantId]);

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
        const s: SupplierRead = await getSupplier(tenantId, supplierId!);
        if (cancelled) return;
        setName(s.name);
        setCompanyName(s.company_name ?? "");
        setTaxId(s.tax_id ?? "");
        setEmail(s.email ?? "");
        setPhone(s.phone ?? "");
        setWebsite(s.website ?? "");
        setCountry(s.country ?? "");
        setCity(s.city ?? "");
        setPostalCode(s.postal_code ?? "");
        setStreet(s.street ?? "");
        setAddress(s.address ?? "");
        setActive(s.active);
        setLeadDays(s.default_lead_time_days != null ? String(s.default_lead_time_days) : "");
        setCurrency(s.default_currency ?? "");
        setMinOrder(s.minimum_order_value != null ? String(s.minimum_order_value) : "");
        setMoq(s.minimum_order_qty != null ? String(s.minimum_order_qty) : "");
        setFreeShippingThreshold(
          s.free_shipping_threshold != null ? String(s.free_shipping_threshold) : "",
        );
        setOffersFreeShipping(s.offers_free_shipping !== false);
        setRequiresMoq(s.requires_moq !== false);
        setNotes(s.notes ?? "");
      } catch {
        if (!cancelled) setLoadErr("Nie udało się wczytać dostawcy.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isNew, supplierId, tenantId, reset]);

  useEffect(() => {
    if (!open || isNew || tab !== "products") return;
    void reloadLinks();
  }, [open, isNew, tab, reloadLinks]);

  /** Po przeładowaniu listy usuń zaznaczenia dla nieistniejących już wierszy. */
  useEffect(() => {
    setSelectedLinkIds((prev) => {
      const next = new Set<number>();
      for (const id of prev) {
        if (links.some((l) => l.id === id)) next.add(id);
      }
      return next;
    });
  }, [links]);

  const selectedCount = useMemo(() => links.filter((l) => selectedLinkIds.has(l.id)).length, [links, selectedLinkIds]);

  /** „Zaznacz wszystko” — tylko indeterminate (checked jest kontrolowany przez React). */
  useEffect(() => {
    const el = bulkSelectAllRef.current;
    if (!el) return;
    const n = links.length;
    el.indeterminate = n > 0 && selectedCount > 0 && selectedCount < n;
  }, [links.length, selectedCount]);

  useEffect(() => {
    if (!open || tab !== "products" || isNew) return;
    const t = productSearch.trim();
    if (t.length < 2) {
      setSearchHits([]);
      return;
    }
    const h = window.setTimeout(() => {
      void api
        .get("/products/", { params: { tenant_id: tenantId, search: t, limit: 12 } })
        .then((res) => {
          const data = res.data;
          const raw = data?.items ?? (Array.isArray(data) ? data : []);
          setSearchHits(
            (raw as Record<string, unknown>[]).map((p) => ({
              id: Number(p.id),
              name: p.name != null ? String(p.name) : undefined,
              symbol: p.symbol != null ? String(p.symbol) : undefined,
              ean: p.ean != null ? String(p.ean) : undefined,
              image_url: p.image_url != null && String(p.image_url).trim() ? String(p.image_url).trim() : null,
              purchase_price:
                p.purchase_price == null || p.purchase_price === ""
                  ? null
                  : (() => {
                      const n = Number(p.purchase_price);
                      return Number.isFinite(n) ? n : null;
                    })(),
            })),
          );
        })
        .catch(() => setSearchHits([]));
    }, 300);
    return () => window.clearTimeout(h);
  }, [open, tab, isNew, productSearch, tenantId]);

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
    const ld = leadDays.trim() === "" ? null : Number(leadDays);
    if (ld != null && (!Number.isFinite(ld) || ld < 0)) {
      setSaveErr("Czas realizacji (dni) musi być liczbą ≥ 0.");
      return;
    }
    const mov = !requiresMoq
      ? null
      : minOrder.trim() === ""
        ? null
        : Number(minOrder.replace(",", "."));
    if (requiresMoq && mov != null && (!Number.isFinite(mov) || mov < 0)) {
      setSaveErr("Minimalna wartość zamówienia nieprawidłowa.");
      return;
    }
    const moqRaw = moq.trim();
    const moqN =
      !requiresMoq ? null : moqRaw === "" ? null : Number.parseInt(moqRaw, 10);
    if (requiresMoq && moqN != null && (Number.isNaN(moqN) || moqN < 0 || String(moqN) !== moqRaw)) {
      setSaveErr("MOQ musi być liczbą całkowitą ≥ 0.");
      return;
    }
    const fst = !offersFreeShipping
      ? null
      : freeShippingThreshold.trim() === ""
        ? null
        : Number(freeShippingThreshold.replace(",", "."));
    if (offersFreeShipping && fst != null && (!Number.isFinite(fst) || fst < 0)) {
      setSaveErr("Próg darmowej dostawy nieprawidłowy.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: nm,
        company_name: companyName.trim() || null,
        tax_id: taxId.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
        country: country.trim() || null,
        city: city.trim() || null,
        postal_code: postalCode.trim() || null,
        street: street.trim() || null,
        address: address.trim() || null,
        active,
        default_lead_time_days: ld,
        default_currency: currency.trim() || null,
        minimum_order_value: mov,
        minimum_order_qty: moqN,
        free_shipping_threshold: fst,
        offers_free_shipping: offersFreeShipping,
        requires_moq: requiresMoq,
        notes: notes.trim() || null,
      };
      if (isNew) {
        await createSupplier({ tenant_id: tenantId, ...payload });
      } else {
        await updateSupplier(tenantId, supplierId!, payload);
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

  const patchLinkField = async (
    linkId: number,
    body: { purchase_price?: number | null; lead_time_days?: number | null; min_order_qty?: number | null },
  ) => {
    setBusyLink(true);
    try {
      await patchSupplierProductLink(tenantId, linkId, body);
      await reloadLinks();
      onSaved();
    } catch {
      await reloadLinks();
    } finally {
      setBusyLink(false);
    }
  };

  const addProductLink = async (hit: ProductSearchHit) => {
    if (isNew || supplierId == null) return;
    if (links.some((l) => l.product_id === hit.id)) {
      window.alert("Ten produkt jest już na liście.");
      return;
    }
    setBusyLink(true);
    try {
      await createSupplierProductLink({
        tenant_id: tenantId,
        supplier_id: supplierId,
        product_id: hit.id,
        purchase_price: hit.purchase_price ?? null,
        lead_time_days: null,
        min_order_qty: null,
      });
      setProductSearch("");
      setSearchHits([]);
      await reloadLinks();
      onSaved();
    } catch (e: unknown) {
      const d =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null;
      window.alert(d != null ? String(d) : "Nie udało się dodać produktu.");
    } finally {
      setBusyLink(false);
    }
  };

  const removeLink = async (linkId: number) => {
    if (!window.confirm("Usunąć produkt z oferty tego dostawcy?")) return;
    setBusyLink(true);
    try {
      await deleteSupplierProductLink(tenantId, linkId);
      await reloadLinks();
      onSaved();
    } catch {
      await reloadLinks();
    } finally {
      setBusyLink(false);
    }
  };

  const toggleLinkSelected = useCallback((linkId: number) => {
    setSelectedLinkIds((prev) => {
      const next = new Set(prev);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  }, []);

  const toggleSelectAllLinks = useCallback(() => {
    setSelectedLinkIds((prev) => {
      const allIds = links.map((l) => l.id);
      if (allIds.length === 0) return prev;
      const allOn = allIds.every((id) => prev.has(id));
      return allOn ? new Set() : new Set(allIds);
    });
  }, [links]);

  /**
   * Buduje body PATCH tylko z wypełnionych pól paska masowego.
   * Zwraca null przy błędnej walidacji.
   */
  const buildBulkPatchBody = useCallback((): {
    purchase_price?: number | null;
    lead_time_days?: number | null;
    min_order_qty?: number | null;
  } | null => {
    const body: {
      purchase_price?: number | null;
      lead_time_days?: number | null;
      min_order_qty?: number | null;
    } = {};
    const p = bulkNetPrice.trim().replace(",", ".");
    if (p !== "") {
      const n = Number(p);
      if (!Number.isFinite(n) || n < 0) {
        window.alert("Cena netto musi być liczbą ≥ 0.");
        return null;
      }
      body.purchase_price = n;
    }
    const ld = bulkLeadDays.trim();
    if (ld !== "") {
      const n = parseInt(ld, 10);
      if (Number.isNaN(n) || n < 0) {
        window.alert("Czas realizacji musi być liczbą całkowitą ≥ 0 (dni).");
        return null;
      }
      body.lead_time_days = n;
    }
    const mq = bulkMoq.trim().replace(",", ".");
    if (mq !== "") {
      const n = Number(mq);
      if (!Number.isFinite(n) || n < 0) {
        window.alert("Min. ilość musi być liczbą ≥ 0.");
        return null;
      }
      body.min_order_qty = n;
    }
    if (Object.keys(body).length === 0) return {};
    return body;
  }, [bulkNetPrice, bulkLeadDays, bulkMoq]);

  const applyBulkEdits = async () => {
    const body = buildBulkPatchBody();
    if (body == null) return;
    if (Object.keys(body).length === 0) {
      window.alert("Wypełnij co najmniej jedno pole: cena netto, czas realizacji lub min. ilość.");
      return;
    }
    const targets = links.filter((l) => selectedLinkIds.has(l.id));
    if (targets.length === 0) {
      window.alert("Zaznacz co najmniej jeden wiersz tabeli.");
      return;
    }
    setBusyLink(true);
    try {
      await Promise.all(targets.map((row) => patchSupplierProductLink(tenantId, row.id, body)));
      setBulkNetPrice("");
      setBulkLeadDays("");
      setBulkMoq("");
      setSelectedLinkIds(new Set());
      await reloadLinks();
      onSaved();
    } catch (e: unknown) {
      const d =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null;
      window.alert(d != null ? String(d) : "Masowa aktualizacja nie powiodła się.");
      await reloadLinks();
    } finally {
      setBusyLink(false);
    }
  };

  if (!open) return null;

  const tabCls = (t: Tab) =>
    `border-b-2 px-2 pb-2 text-sm font-medium ${
      tab === t ? "border-violet-600 text-violet-800" : "border-transparent text-slate-500 hover:text-slate-800"
    }`;

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[min(92vh,calc(100dvh-2rem))] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {isNew ? "Nowy dostawca" : "Edycja dostawcy"}
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-900">{name.trim() || (isNew ? "—" : "Dostawca")}</h2>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200/80 pt-2">
            <button type="button" className={tabCls("basic")} onClick={() => setTab("basic")}>
              Podstawowe
            </button>
            <button type="button" className={tabCls("address")} onClick={() => setTab("address")}>
              Adres
            </button>
            <button type="button" className={tabCls("contact")} onClick={() => setTab("contact")}>
              Kontakt
            </button>
            <button
              type="button"
              className={tabCls("products")}
              onClick={() => setTab("products")}
              disabled={isNew}
              title={isNew ? "Najpierw utwórz dostawcę" : undefined}
            >
              Produkty
            </button>
          </div>
        </div>
        {loadErr ? <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-800">{loadErr}</div> : null}

        {tab !== "products" ? (
          <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {tab === "basic" ? (
                <>
                  <div>
                    <label className={fieldLabel}>Krótka nazwa</label>
                    <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div>
                    <label className={fieldLabel}>Pełna nazwa firmy</label>
                    <input
                      className={inputClass}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="np. nazwa prawna na fakturze"
                    />
                  </div>
                  <div>
                    <label className={fieldLabel}>NIP</label>
                    <input className={inputClass} value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="opcjonalnie" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ustawienia handlowe</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-slate-300 text-violet-600"
                        checked={offersFreeShipping}
                        onChange={(e) => setOffersFreeShipping(e.target.checked)}
                      />
                      <span>
                        <span className="font-medium">Darmowa dostawa przy progu</span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-slate-300 text-violet-600"
                        checked={requiresMoq}
                        onChange={(e) => setRequiresMoq(e.target.checked)}
                      />
                      <span>
                        <span className="font-medium">Minimalne zamówienie (MOQ / wartość)</span>
                      </span>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className={fieldLabel}>Domyślna waluta</label>
                      <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                        <option value="">—</option>
                        {SUPPLIER_CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        {currency && !SUPPLIER_CURRENCIES.includes(currency as SupplierCurrencyCode) ? (
                          <option value={currency}>{currency} (spoza listy — wybierz walutę)</option>
                        ) : null}
                      </select>
                    </div>
                    <div>
                      <label className={fieldLabel}>Domyślny czas dostawy (dni)</label>
                      <input
                        type="number"
                        min={0}
                        className={inputClass}
                        value={leadDays}
                        onChange={(e) => setLeadDays(e.target.value)}
                        placeholder="np. 7"
                      />
                    </div>
                    <div>
                      <label className={fieldLabel}>Darmowa dostawa od (netto)</label>
                      <input
                        className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                        value={freeShippingThreshold}
                        onChange={(e) => setFreeShippingThreshold(e.target.value)}
                        placeholder="np. 500"
                        inputMode="decimal"
                        disabled={!offersFreeShipping}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={fieldLabel}>Min. wartość zamówienia (netto)</label>
                      <input
                        className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                        value={minOrder}
                        onChange={(e) => setMinOrder(e.target.value)}
                        placeholder="0"
                        inputMode="decimal"
                        disabled={!requiresMoq}
                      />
                    </div>
                    <div>
                      <label className={fieldLabel}>MOQ (min. ilość, szt.)</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                        value={moq}
                        onChange={(e) => setMoq(e.target.value)}
                        placeholder="opcjonalnie"
                        disabled={!requiresMoq}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={fieldLabel}>Notatki</label>
                    <textarea className={`${inputClass} min-h-[64px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
                </>
              ) : null}

              {tab === "address" ? (
                <>
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
                    {country && SUPPLIER_COUNTRY_VALUES.has(country) ? (
                      <p className="mt-1 text-xs text-slate-500">
                        UE (VAT): {SUPPLIER_COUNTRIES.find((x) => x.value === country)?.isEu ? "tak" : "nie"}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className={fieldLabel}>Miasto</label>
                    <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabel}>Kod pocztowy</label>
                    <input className={inputClass} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabel}>Ulica i numer</label>
                    <textarea className={`${inputClass} min-h-[72px]`} value={street} onChange={(e) => setStreet(e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabel}>Adres</label>
                    <textarea className={`${inputClass} min-h-[64px]`} value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                </>
              ) : null}

              {tab === "contact" ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={fieldLabel}>E-mail</label>
                      <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div>
                      <label className={fieldLabel}>Telefon</label>
                      <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className={fieldLabel}>Strona WWW</label>
                    <input type="url" className={inputClass} value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </div>
                </>
              ) : null}

              {saveErr ? <p className="text-sm text-red-600">{saveErr}</p> : null}
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-3">
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
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {isNew ? (
                <p className="text-sm text-slate-600">Utwórz dostawcę w zakładce „Podstawowe”, potem edytuj go ponownie, aby dodać produkty.</p>
              ) : (
                <>
                  {linksErr ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{linksErr}</div> : null}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dodaj produkt</p>
                    <input
                      className={inputClass}
                      placeholder="Szukaj produktu (nazwa, SKU, EAN)…"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      autoComplete="off"
                      disabled={busyLink || linksLoading}
                    />
                    {productSearch.trim().length >= 2 && searchHits.length > 0 && visibleSearchHits.length === 0 ? (
                      <p className="text-xs text-slate-600">Wszystkie znalezione produkty są już przypisane do tego dostawcy.</p>
                    ) : null}
                    {visibleSearchHits.length > 0 ? (
                      <ul className="max-h-36 overflow-y-auto rounded border border-slate-200 bg-white text-sm shadow-sm">
                        {visibleSearchHits.map((h) => (
                          <li key={h.id}>
                            <button
                              type="button"
                              disabled={busyLink}
                              className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-violet-50 disabled:opacity-50"
                              onClick={() => void addProductLink(h)}
                            >
                              <SupplierProductThumb
                                url={h.image_url}
                                className="h-9 w-9 shrink-0 rounded border border-slate-200 bg-slate-100"
                              />
                              <span className="min-w-0">
                                <span className="block font-medium">{(h.name ?? "").trim() || "—"}</span>
                                <span className="block text-xs text-slate-500">
                                  EAN: {(h.ean ?? "").trim() || "—"} · SKU: {(h.symbol ?? "").trim() || "—"}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  {/* Pasek masowej edycji oferty (tylko zaznaczone wiersze). */}
                  {!linksLoading && links.length > 0 ? (
                    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-3">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                        <input
                          ref={bulkSelectAllRef}
                          type="checkbox"
                          className="rounded border-slate-300 text-violet-600"
                          checked={links.length > 0 && selectedCount === links.length}
                          disabled={busyLink}
                          onChange={() => toggleSelectAllLinks()}
                          aria-label="Zaznacz wszystko"
                        />
                        <span className="font-medium">Zaznacz wszystko</span>
                      </label>
                      <span className="text-sm text-slate-700">
                        Zaznaczono <span className="font-semibold tabular-nums">{selectedCount}</span>
                      </span>
                      <div className="flex min-w-[6rem] flex-col gap-0.5">
                        <label className="text-xs font-medium text-slate-600">Cena netto</label>
                        <input
                          className={inputTableClass}
                          value={bulkNetPrice}
                          onChange={(e) => setBulkNetPrice(e.target.value)}
                          placeholder="—"
                          disabled={busyLink}
                          inputMode="decimal"
                        />
                      </div>
                      <div className="flex min-w-[5rem] flex-col gap-0.5">
                        <label className="text-xs font-medium text-slate-600">Czas realizacji</label>
                        <input
                          className={inputTableClass}
                          type="number"
                          min={0}
                          value={bulkLeadDays}
                          onChange={(e) => setBulkLeadDays(e.target.value)}
                          placeholder="dni"
                          disabled={busyLink}
                        />
                      </div>
                      <div className="flex min-w-[5rem] flex-col gap-0.5">
                        <label className="text-xs font-medium text-slate-600">Min. ilość</label>
                        <input
                          className={inputTableClass}
                          value={bulkMoq}
                          onChange={(e) => setBulkMoq(e.target.value)}
                          placeholder="—"
                          disabled={busyLink}
                          inputMode="decimal"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={busyLink || selectedCount === 0}
                        onClick={() => void applyBulkEdits()}
                        className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                      >
                        Zastosuj
                      </button>
                    </div>
                  ) : null}
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="bg-slate-50 text-left">
                        <tr>
                          <th className="w-10 px-2 py-2" aria-label="Zaznacz" />
                          <th className="w-14 px-2 py-2" aria-label="Zdjęcie" />
                          <th className="min-w-[8rem] px-3 py-2">Produkt</th>
                          <th className="px-3 py-2">EAN</th>
                          <th className="px-3 py-2">SKU</th>
                          <th className="px-3 py-2 text-right">Cena netto</th>
                          <th className="px-3 py-2 text-right">Czas (dni)</th>
                          <th className="px-3 py-2 text-right">Min. ilość</th>
                          <th className="w-16 px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {linksLoading ? (
                          <tr>
                            <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                              Wczytywanie…
                            </td>
                          </tr>
                        ) : links.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                              Brak produktów — dodaj z wyszukiwarki powyżej.
                            </td>
                          </tr>
                        ) : (
                          links.map((row) => (
                            <LinkRow
                              key={row.id}
                              row={row}
                              busy={busyLink}
                              selected={selectedLinkIds.has(row.id)}
                              onToggleSelected={() => toggleLinkSelected(row.id)}
                              inputTableClass={inputTableClass}
                              onPatch={(body) => void patchLinkField(row.id, body)}
                              onRemove={() => void removeLink(row.id)}
                            />
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className="flex shrink-0 justify-end border-t border-slate-100 px-5 py-3">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-50">
                Zamknij
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SupplierProductThumb({ url, className }: { url?: string | null; className?: string }) {
  const [bad, setBad] = useState(false);
  if (!url || bad) return <div className={className} aria-hidden />;
  return <img src={url} alt="" className={className} onError={() => setBad(true)} />;
}

function LinkRow({
  row,
  busy,
  selected,
  onToggleSelected,
  inputTableClass,
  onPatch,
  onRemove,
}: {
  row: SupplierProductCatalogItem;
  busy: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  inputTableClass: string;
  onPatch: (body: { purchase_price?: number | null; lead_time_days?: number | null; min_order_qty?: number | null }) => void;
  onRemove: () => void;
}) {
  const [price, setPrice] = useState(row.purchase_price != null ? String(row.purchase_price) : "");
  const [lead, setLead] = useState(row.lead_time_days != null ? String(row.lead_time_days) : "");
  const [moq, setMoq] = useState(row.min_order_qty != null ? String(row.min_order_qty) : "");

  useEffect(() => {
    setPrice(row.purchase_price != null ? String(row.purchase_price) : "");
    setLead(row.lead_time_days != null ? String(row.lead_time_days) : "");
    setMoq(row.min_order_qty != null ? String(row.min_order_qty) : "");
  }, [row.purchase_price, row.lead_time_days, row.min_order_qty, row.id]);

  const parseOptFloat = (s: string): number | null => {
    const t = s.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  const parseOptInt = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  };

  const commitPrice = () => {
    const n = parseOptFloat(price);
    if (price.trim() !== "" && n == null) return;
    if (n != null && n < 0) return;
    const cur = row.purchase_price;
    if ((n == null && cur == null) || (n != null && cur != null && Math.abs(n - cur) < 1e-9)) return;
    onPatch({ purchase_price: n });
  };
  const commitLead = () => {
    const n = parseOptInt(lead);
    if (lead.trim() !== "" && n == null) return;
    if (n != null && n < 0) return;
    const cur = row.lead_time_days;
    if ((n == null && cur == null) || (n != null && cur != null && n === cur)) return;
    onPatch({ lead_time_days: n });
  };
  const commitMoq = () => {
    const n = parseOptFloat(moq);
    if (moq.trim() !== "" && n == null) return;
    if (n != null && n < 0) return;
    const cur = row.min_order_qty;
    if ((n == null && cur == null) || (n != null && cur != null && Math.abs(n - cur) < 1e-9)) return;
    onPatch({ min_order_qty: n });
  };

  return (
    <tr className="border-t border-slate-100">
      <td className="px-2 py-2 align-middle text-center">
        <input
          type="checkbox"
          className="rounded border-slate-300 text-violet-600"
          checked={selected}
          disabled={busy}
          onChange={onToggleSelected}
          aria-label="Zaznacz wiersz"
        />
      </td>
      <td className="px-2 py-2 align-middle">
        <SupplierProductThumb
          url={row.image_url}
          className="mx-auto h-11 w-11 rounded border border-slate-200 bg-slate-100 object-cover"
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <div className="font-medium leading-tight text-slate-900">{(row.name ?? "").trim() || `Produkt #${row.product_id}`}</div>
      </td>
      <td className="px-3 py-2 align-middle font-mono text-xs text-slate-700">{(row.ean ?? "").trim() || "—"}</td>
      <td className="px-3 py-2 align-middle font-mono text-xs text-slate-700">{(row.sku ?? "").trim() || "—"}</td>
      <td className="px-3 py-2 text-right align-middle">
        <input
          className={inputTableClass}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={commitPrice}
          disabled={busy}
          placeholder="—"
        />
      </td>
      <td className="px-3 py-2 text-right align-middle">
        <input
          className={inputTableClass}
          value={lead}
          onChange={(e) => setLead(e.target.value)}
          onBlur={commitLead}
          disabled={busy}
          placeholder="—"
        />
      </td>
      <td className="px-3 py-2 text-right align-middle">
        <input
          className={inputTableClass}
          value={moq}
          onChange={(e) => setMoq(e.target.value)}
          onBlur={commitMoq}
          disabled={busy}
          placeholder="—"
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <button type="button" disabled={busy} onClick={onRemove} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-40">
          Usuń
        </button>
      </td>
    </tr>
  );
}
