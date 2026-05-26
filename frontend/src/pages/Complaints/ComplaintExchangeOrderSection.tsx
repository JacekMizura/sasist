import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";

import api from "../../api/axios";
import { getComplaint, patchComplaintLine, updateLineOperation } from "../../api/complaintsApi";
import { createOrder } from "../../api/ordersApi";
import type { ComplaintDetail } from "../../types/complaint";
import {
  buildComplaintExchangePrefill,
  complaintCustomerBillingPrefill,
  type ComplaintOrderKind,
} from "./complaintExchangePrefill";

const SESSION_KEY_PREFIX = "complaint_exchange_created_";

type CatalogProduct = {
  id: number;
  name?: string | null;
  ean?: string | null;
  symbol?: string | null;
  sku?: string | null;
  image_url?: string | null;
  sale_price?: number | null;
  stock_quantity?: number;
};

type LineRow = {
  product: CatalogProduct;
  quantity: number;
  unit_price: number;
};

function firstImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const first = imageUrl
    .trim()
    .split(";")
    .map((s) => s.trim())
    .find(Boolean);
  return first || null;
}

function parseProductsResponse(data: unknown): CatalogProduct[] {
  if (Array.isArray(data)) return data as CatalogProduct[];
  if (data && typeof data === "object" && "items" in data && Array.isArray((data as { items: unknown }).items)) {
    return (data as { items: CatalogProduct[] }).items;
  }
  return [];
}

function defaultPrefillComplaintLineId(d: ComplaintDetail): number | null {
  const ex = (d.lines ?? []).find(
    (l) => String(l.decision ?? "").trim().toLowerCase() === "exchange" && l.product_id != null && l.product_id > 0,
  );
  if (ex) return ex.id;
  const any = (d.lines ?? []).find((l) => l.product_id != null && l.product_id > 0);
  return any?.id ?? null;
}

function readStoredCreatedOrder(complaintId: number): { id: number; number?: string | null } | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${complaintId}`);
    if (!raw?.trim()) return null;
    const p = JSON.parse(raw) as { id?: unknown; number?: unknown };
    if (typeof p?.id === "number" && p.id > 0) {
      return { id: p.id, number: typeof p.number === "string" ? p.number : null };
    }
  } catch {
    /* może być surowe id lub stary format */
  }
  if (raw?.trim()) {
    const n = parseInt(raw.trim(), 10);
    if (Number.isFinite(n) && n > 0) return { id: n };
  }
  return null;
}

function persistCreatedOrder(complaintId: number, id: number, number?: string | null) {
  try {
    sessionStorage.setItem(`${SESSION_KEY_PREFIX}${complaintId}`, JSON.stringify({ id, number: number ?? null }));
  } catch {
    /* ignore */
  }
}

export type ComplaintExchangeOrderSectionProps = {
  data: ComplaintDetail;
  tenantId: number;
  warehouseId: number;
  focusLineId: number | null;
  focusComplaintOrderKind: ComplaintOrderKind | null;
  onConsumedFocus?: () => void;
  onComplaintUpdated: (next: ComplaintDetail) => void;
  /** Formularz w nakładce (jedyny tryb na stronie szczegółów reklamacji). */
  modal?: { open: boolean; onClose: () => void };
  /** Tryb ustalony w operacjach (Wymiana + odbiór / Tylko dostawa) — bez przełącznika w formularzu. */
  hideComplaintOrderTypeSwitch?: boolean;
};

export default function ComplaintExchangeOrderSection({
  data,
  tenantId,
  warehouseId,
  focusLineId,
  focusComplaintOrderKind,
  onConsumedFocus,
  onComplaintUpdated,
  modal,
  hideComplaintOrderTypeSwitch = false,
}: ComplaintExchangeOrderSectionProps) {
  const lineIdForSubmitRef = useRef<number | null>(null);
  const lastBootstrapComplaintId = useRef<number | null>(null);

  const [createdOrder, setCreatedOrder] = useState<{ id: number; number?: string | null } | null>(() =>
    readStoredCreatedOrder(data.id),
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [billing_street, setBilling_street] = useState("");
  const [billing_city, setBilling_city] = useState("");
  const [billing_postal_code, setBilling_postal_code] = useState("");
  const [billing_country, setBilling_country] = useState("");
  const [complaintOrderType, setComplaintOrderType] = useState<ComplaintOrderKind>("EXCHANGE");
  const [lines, setLines] = useState<LineRow[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shippingCost, setShippingCost] = useState("0");

  const applyCustomerFields = useCallback((d: ComplaintDetail) => {
    const c = complaintCustomerBillingPrefill(d);
    setFirstName(c.firstName);
    setLastName(c.lastName);
    setPhone(c.phone);
    setEmail(c.email);
    setBilling_street(c.billing_street);
    setBilling_city(c.billing_city);
    setBilling_postal_code(c.billing_postal_code);
    setBilling_country(c.billing_country);
  }, []);

  const fetchLinesFromComplaintLine = useCallback(
    async (d: ComplaintDetail, complaintLineId: number | null, orderKind: ComplaintOrderKind) => {
      const lid = complaintLineId ?? defaultPrefillComplaintLineId(d);
      lineIdForSubmitRef.current = lid;
      const pre = buildComplaintExchangePrefill(d, orderKind, lid);
      const built: LineRow[] = [];
      for (const line of pre.lines) {
        try {
          const r = await api.get<Record<string, unknown>>(`/products/${line.productId}/`, {
            params: { tenant_id: tenantId },
          });
          const raw = r.data;
          const cp: CatalogProduct = {
            id: line.productId,
            name: (raw.name as string) ?? null,
            ean: (raw.ean as string) ?? null,
            symbol: (raw.symbol as string) ?? null,
            sku: (raw.sku as string) ?? null,
            image_url: (raw.image_url as string) ?? null,
            sale_price: raw.sale_price != null ? Number(raw.sale_price) : null,
            stock_quantity: raw.stock_quantity != null ? Number(raw.stock_quantity) : 0,
          };
          const price =
            line.unitPrice != null && Number.isFinite(line.unitPrice)
              ? line.unitPrice
              : cp.sale_price != null && Number.isFinite(cp.sale_price)
                ? cp.sale_price
                : 0;
          built.push({ product: cp, quantity: line.quantity, unit_price: price });
        } catch {
          /* produkt niedostępny — użytkownik wybierze z katalogu */
        }
      }
      setLines(built);
    },
    [tenantId],
  );

  useEffect(() => {
    lastBootstrapComplaintId.current = null;
    setCreatedOrder(readStoredCreatedOrder(data.id));
  }, [data.id]);

  useEffect(() => {
    if (createdOrder != null) return;
    if (lastBootstrapComplaintId.current === data.id) return;
    lastBootstrapComplaintId.current = data.id;
    applyCustomerFields(data);
    void fetchLinesFromComplaintLine(data, defaultPrefillComplaintLineId(data), "EXCHANGE");
  }, [applyCustomerFields, createdOrder, data, fetchLinesFromComplaintLine]);

  useEffect(() => {
    if (focusLineId == null && focusComplaintOrderKind == null) return;
    if (createdOrder != null) return;
    if (focusComplaintOrderKind != null) {
      setComplaintOrderType(focusComplaintOrderKind);
    }
    if (focusLineId != null) {
      lineIdForSubmitRef.current = focusLineId;
    }
    const kindForFetch = focusComplaintOrderKind ?? "EXCHANGE";
    void fetchLinesFromComplaintLine(data, focusLineId, kindForFetch);
    onConsumedFocus?.();
  }, [createdOrder, data, fetchLinesFromComplaintLine, focusComplaintOrderKind, focusLineId, onConsumedFocus]);

  useEffect(() => {
    if (!hideComplaintOrderTypeSwitch || focusComplaintOrderKind == null) return;
    setComplaintOrderType(focusComplaintOrderKind);
  }, [hideComplaintOrderTypeSwitch, focusComplaintOrderKind]);

  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      setSearchLoading(true);
      const base = { tenant_id: tenantId, limit: 18 };
      const eanQ = q.replace(/\s/g, "");
      Promise.all([
        api.get<unknown>("/products/", { params: { ...base, name: q } }),
        api.get<unknown>("/products/", { params: { ...base, symbol: q } }),
        /^\d[\d\s-]{5,}$/.test(eanQ)
          ? api.get<unknown>("/products/", { params: { ...base, ean: eanQ } })
          : Promise.resolve({ data: [] }),
      ])
        .then(([r1, r2, r3]) => {
          const map = new Map<number, CatalogProduct>();
          for (const p of parseProductsResponse(r1.data)) map.set(p.id, p);
          for (const p of parseProductsResponse(r2.data)) map.set(p.id, p);
          for (const p of parseProductsResponse(r3.data)) map.set(p.id, p);
          setSearchResults(Array.from(map.values()).slice(0, 20));
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 280);
    return () => window.clearTimeout(t);
  }, [searchQ, tenantId]);

  const goodsTotal = useMemo(() => lines.reduce((s, l) => s + l.quantity * l.unit_price, 0), [lines]);

  const shippingNum = useMemo(() => {
    const n = parseFloat(shippingCost.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [shippingCost]);

  const totalAmount = useMemo(() => goodsTotal + shippingNum, [goodsTotal, shippingNum]);

  const addProduct = useCallback((p: CatalogProduct) => {
    const price = p.sale_price != null && Number.isFinite(p.sale_price) ? Number(p.sale_price) : 0;
    setLines((prev) => {
      const i = prev.findIndex((x) => x.product.id === p.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], quantity: next[i].quantity + 1 };
        return next;
      }
      return [...prev, { product: p, quantity: 1, unit_price: price }];
    });
    setSearchQ("");
    setSearchResults([]);
  }, []);

  const setQty = useCallback((productId: number, qty: number) => {
    const q = Math.floor(qty);
    setLines((prev) => {
      if (q <= 0) return prev.filter((l) => l.product.id !== productId);
      return prev.map((l) => (l.product.id === productId ? { ...l, quantity: q } : l));
    });
  }, []);

  const setLinePrice = useCallback((productId: number, price: number) => {
    setLines((prev) =>
      prev.map((l) => (l.product.id === productId ? { ...l, unit_price: Math.max(0, price) } : l)),
    );
  }, []);

  const removeLine = useCallback((productId: number) => {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (lines.length === 0) {
      setError("Wybierz co najmniej jeden produkt.");
      return;
    }
    if (lines.some((l) => l.quantity <= 0)) {
      setError("Ilości muszą być większe od zera.");
      return;
    }
    if (!firstName.trim() && !lastName.trim()) {
      setError("Podaj imię lub nazwisko klienta.");
      return;
    }
    if (!phone.trim()) {
      setError("Podaj telefon klienta.");
      return;
    }
    if (!email.trim()) {
      setError("Podaj e-mail klienta.");
      return;
    }
    if (!billing_street.trim() || !billing_city.trim() || !billing_postal_code.trim()) {
      setError("Uzupełnij adres: ulica, kod pocztowy i miejscowość.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createOrder({
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        source: "COMPLAINT",
        note: null,
        comment: null,
        shipping_cost: shippingNum,
        billing_street: billing_street.trim() || null,
        billing_city: billing_city.trim() || null,
        billing_postal_code: billing_postal_code.trim() || null,
        billing_country: billing_country.trim() || null,
        shipping_street: billing_street.trim() || null,
        shipping_city: billing_city.trim() || null,
        shipping_postal_code: billing_postal_code.trim() || null,
        shipping_country: billing_country.trim() || null,
        items: lines.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          unit_price: l.unit_price,
        })),
        origin: "COMPLAINT",
        complaint_id: data.id,
        original_order_id: data.order_id ?? null,
        complaint_order_type: complaintOrderType,
      });

      const submitLineId = lineIdForSubmitRef.current ?? defaultPrefillComplaintLineId(data);
      if (submitLineId != null) {
        try {
          await patchComplaintLine(data.id, submitLineId, tenantId, warehouseId, { decision: "exchange" });
          await updateLineOperation(submitLineId, tenantId, warehouseId, "EXCHANGE_ORDER_PLACED");
        } catch {
          try {
            await patchComplaintLine(data.id, submitLineId, tenantId, warehouseId, { decision: "exchange" });
          } catch {
            /* zamówienie utworzone */
          }
        }
      }

      try {
        const next = await getComplaint(data.id, tenantId, warehouseId);
        onComplaintUpdated(next);
      } catch {
        /* ignore */
      }

      persistCreatedOrder(data.id, res.id, res.number ?? null);
      setCreatedOrder({ id: res.id, number: res.number ?? null });
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? String((err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? "")
          : "";
      setError(msg || "Nie udało się utworzyć zamówienia.");
    } finally {
      setSubmitting(false);
    }
  };

  const cardClass = "rounded-xl border border-gray-200 bg-white p-4 shadow-sm";
  const sectionTitle = "text-xs font-semibold uppercase tracking-wide text-gray-500";

  if (modal && !modal.open) return null;

  const wrapModal = (node: ReactNode) =>
    modal ? (
      <div
        className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="replacement-order-modal-title"
      >
        <button type="button" className="fixed inset-0 border-0 bg-transparent" aria-label="Zamknij" onClick={modal.onClose} />
        <div className="relative z-10 my-auto w-full min-w-0 rounded-xl border border-gray-200 bg-white shadow-xl">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              modal.onClose();
            }}
            className="absolute right-3 top-3 z-20 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
          >
            Zamknij
          </button>
          <div className="max-h-[min(90vh,900px)] overflow-y-auto p-4 pt-14">{node}</div>
        </div>
      </div>
    ) : (
      node
    );

  if (createdOrder != null) {
    const label =
      createdOrder.number && String(createdOrder.number).trim()
        ? String(createdOrder.number).trim()
        : String(createdOrder.id);
    return wrapModal(
      <div className={`${cardClass} border-green-100 bg-green-50/40`}>
        <h2 id={modal ? "replacement-order-modal-title" : undefined} className={sectionTitle}>
          Zamówienie z reklamacji
        </h2>
        <p className="mt-2 text-sm text-green-950">
          <Link
            className="font-semibold text-blue-700 underline decoration-2 underline-offset-2 hover:text-blue-900"
            to={`/orders/${createdOrder.id}`}
          >
            Zamówienie reklamacyjne #{label}
          </Link>
        </p>
      </div>,
    );
  }

  return wrapModal(
    <div className={modal ? "border-0 bg-transparent p-0 shadow-none" : cardClass}>
      <h2 id={modal ? "replacement-order-modal-title" : undefined} className={sectionTitle}>
        Dodaj nowe zamówienie reklamacyjne
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        Dane wypełnione z zamówienia źródłowego — możesz poprawić klienta, adres, produkt i ilość przed zapisem.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        {!hideComplaintOrderTypeSwitch ? (
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <p className="text-[11px] font-semibold text-gray-700">Tryb wysyłki wymiany</p>
            <div className="mt-2 space-y-2">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="complaintOrderType"
                  className="mt-1"
                  checked={complaintOrderType === "EXCHANGE"}
                  onChange={() => setComplaintOrderType("EXCHANGE")}
                />
                <span>
                  <span className="font-medium text-gray-900">Wymiana (odbiór + dostawa)</span>
                  <span className="mt-0.5 block text-xs text-gray-600">Pełny przepływ wymiany z odbiorem towaru.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="complaintOrderType"
                  className="mt-1"
                  checked={complaintOrderType === "REPLACEMENT"}
                  onChange={() => setComplaintOrderType("REPLACEMENT")}
                />
                <span>
                  <span className="font-medium text-gray-900">Tylko wysyłka nowego</span>
                  <span className="mt-0.5 block text-xs text-gray-600">Nowy towar do klienta (bez odbioru przy tej ścieżce).</span>
                </span>
              </label>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-gray-600">
            Tryb:{" "}
            <span className="font-semibold text-gray-900">
              {complaintOrderType === "EXCHANGE" ? "Wymiana + odbiór (dostawa i zwrot)" : "Tylko dostawa nowego towaru"}
            </span>
          </p>
        )}

        <div>
          <h3 className={`${sectionTitle} !normal-case`}>Klient</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-gray-600">Imię</span>
              <input
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Nazwisko</span>
              <input
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Telefon</span>
              <input
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-gray-600">E-mail</span>
              <input
                type="email"
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div>
          <h3 className={`${sectionTitle} !normal-case`}>Adres dostawy / rozliczeniowy</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-gray-600">Ulica i numer</span>
              <input
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                value={billing_street}
                onChange={(e) => setBilling_street(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Kod pocztowy</span>
              <input
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                value={billing_postal_code}
                onChange={(e) => setBilling_postal_code(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Miejscowość</span>
              <input
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                value={billing_city}
                onChange={(e) => setBilling_city(e.target.value)}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-gray-600">Kraj (opcjonalnie)</span>
              <input
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                value={billing_country}
                onChange={(e) => setBilling_country(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div>
          <h3 className={`${sectionTitle} !normal-case`}>Produkty</h3>
          <input
            type="search"
            placeholder="Szukaj po nazwie lub SKU…"
            className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            autoComplete="off"
          />
          {searchLoading ? <p className="mt-1 text-xs text-gray-500">Szukanie…</p> : null}
          {searchResults.length > 0 ? (
            <ul className="mt-2 max-h-60 overflow-auto rounded-lg border border-gray-100 bg-gray-50/90">
              {searchResults.map((p) => {
                const img = firstImageUrl(p.image_url ?? undefined);
                const sku = (p.sku || p.symbol || "—") as string;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => addProduct(p)}
                      className="flex w-full gap-2 border-b border-gray-100 px-2 py-2 text-left text-sm hover:bg-white"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded border border-gray-200 bg-white">
                        {img ? (
                          <img src={img} alt="" className="h-full w-full object-contain" loading="lazy" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">—</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-gray-900">{p.name || `ID ${p.id}`}</div>
                        <div className="text-xs text-gray-500">
                          EAN {p.ean || "—"} · SKU {sku}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {lines.length === 0 ? (
            <p className="mt-2 text-sm text-amber-800">Dodaj produkt z wyszukiwarki (wymagane co najmniej jedna pozycja).</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500">
                    <th className="pb-2 pr-2">Produkt</th>
                    <th className="pb-2 pr-2">Cena j.</th>
                    <th className="pb-2 pr-2">Ilość</th>
                    <th className="pb-2 pr-2">Suma</th>
                    <th className="w-8 pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.product.id} className="border-b border-gray-100">
                      <td className="py-2 pr-2">
                        <div className="font-medium text-gray-900">{l.product.name}</div>
                        <div className="text-xs text-gray-500">{l.product.ean || "—"} · {l.product.symbol || l.product.sku || "—"}</div>
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="w-24 rounded border border-gray-200 px-1 py-0.5"
                          value={l.unit_price}
                          onChange={(e) => setLinePrice(l.product.id, parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="w-16 rounded border border-gray-200 px-1 py-0.5"
                          value={l.quantity}
                          onChange={(e) => setQty(l.product.id, parseInt(e.target.value, 10) || 0)}
                        />
                      </td>
                      <td className="py-2 pr-2 font-medium tabular-nums">{(l.quantity * l.unit_price).toFixed(2)}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => removeLine(l.product.id)}
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                          aria-label="Usuń"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2 border-t border-gray-100 pt-3">
          <label className="block text-sm">
            <span className="text-gray-600">Koszt wysyłki</span>
            <input
              type="text"
              inputMode="decimal"
              className="mt-1 w-32 rounded-md border border-gray-200 px-2 py-1.5 text-sm tabular-nums"
              value={shippingCost}
              onChange={(e) => setShippingCost(e.target.value)}
            />
          </label>
          <p className="text-sm text-gray-700">
            Razem: <span className="font-semibold tabular-nums text-gray-900">{totalAmount.toFixed(2)}</span>
          </p>
        </div>

        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || lines.length === 0}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Tworzenie…" : "Utwórz zamówienie reklamacyjne"}
        </button>
      </form>
    </div>,
  );
}
