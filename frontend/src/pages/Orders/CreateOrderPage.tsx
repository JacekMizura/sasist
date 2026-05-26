import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import api from "../../api/axios";
import { patchComplaintLine, updateLineOperation } from "../../api/complaintsApi";
import { createOrder } from "../../api/ordersApi";
import {
  getCustomer,
  listCustomers,
  type CustomerAddressDto,
  type CustomerListRow,
} from "../../api/customersApi";
import { getOrderPanelSubgroups, getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import { getShippingMethods } from "../../api/shippingMethodsApi";
import { OrderPanelStatusSelect } from "../../components/orders/OrderPanelStatusSelect";
import {
  OrdersPanelStatusSidebar,
  type OrderPanelFilter,
} from "../../components/orders/OrdersPanelStatusSidebar";
import { ShippingMethodLogo } from "../../components/shipping/ShippingMethodLogo";
import { useWarehouse } from "../../context/WarehouseContext";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { ComplaintExchangePrefillState } from "../Complaints/complaintExchangePrefill";

const DEFAULT_TENANT_ID = 1;

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

type CatalogBundle = {
  id: number;
  name: string;
  sku?: string | null;
  ean?: string | null;
  sale_price?: number | null;
};

type SearchHit =
  | { type: "product"; product: CatalogProduct }
  | { type: "bundle"; bundle: CatalogBundle };

type LineRow =
  | { lineKey: string; kind: "product"; product: CatalogProduct; quantity: number; unit_price: number }
  | { lineKey: string; kind: "bundle"; bundle: CatalogBundle; quantity: number; unit_price: number };

const PAYMENT_METHOD_PRESETS = ["przelew", "pobranie", "BLIK", "karta", "gotówka"] as const;
const PAYMENT_STATUS_PRESETS = ["nieopłacone", "opłacone", "częściowo", "zwrot"] as const;

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

function parseBundlesResponse(data: unknown): CatalogBundle[] {
  if (Array.isArray(data)) return data as CatalogBundle[];
  return [];
}

function formatCustomerAddressStreet(addr: CustomerAddressDto): string {
  const base = `${(addr.street || "").trim()} ${(addr.house_number || "").trim()}`.trim();
  const apt = (addr.apartment_number || "").trim();
  return apt ? `${base}/${apt}` : base;
}

export default function CreateOrderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? 1;
  const [panelSummary, setPanelSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [panelSubgroups, setPanelSubgroups] = useState<OrderUiPanelSubgroupRead[] | null>(null);
  const [documentType, setDocumentType] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [salesDocumentNumber, setSalesDocumentNumber] = useState("");

  const exchangePrefillAppliedRef = useRef(false);
  const exchangeContextRef = useRef<ComplaintExchangePrefillState | null>(null);
  const [exchangeFromComplaint, setExchangeFromComplaint] = useState(false);
  const [exchangeComplaintId, setExchangeComplaintId] = useState<number | null>(null);
  const [apiTenantId, setApiTenantId] = useState(DEFAULT_TENANT_ID);

  const [login, setLogin] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [shippingCost, setShippingCost] = useState("0");
  const [billing_street, setBilling_street] = useState("");
  const [billing_city, setBilling_city] = useState("");
  const [billing_postal_code, setBilling_postal_code] = useState("");
  const [billing_country, setBilling_country] = useState("");
  const [shipping_street, setShipping_street] = useState("");
  const [shipping_city, setShipping_city] = useState("");
  const [shipping_postal_code, setShipping_postal_code] = useState("");
  const [shipping_country, setShipping_country] = useState("");
  const [shipSameAsBilling, setShipSameAsBilling] = useState(true);
  const [lines, setLines] = useState<LineRow[]>([]);

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [checkBundleStock, setCheckBundleStock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shippingMethods, setShippingMethods] = useState<
    { id: string; name: string; logo_url: string | null }[]
  >([]);
  const [shippingMethodId, setShippingMethodId] = useState("");
  const [customerOptions, setCustomerOptions] = useState<CustomerListRow[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerSelectKey, setCustomerSelectKey] = useState(0);
  const [customerSelectBusy, setCustomerSelectBusy] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [orderNip, setOrderNip] = useState("");
  const [customerShippingAddresses, setCustomerShippingAddresses] = useState<CustomerAddressDto[]>([]);
  const [selectedShippingAddressIndex, setSelectedShippingAddressIndex] = useState(0);

  useEffect(() => {
    void listCustomers({ tenant_id: apiTenantId })
      .then(setCustomerOptions)
      .catch(() => setCustomerOptions([]));
  }, [apiTenantId]);

  useEffect(() => {
    const st = location.state as { complaintExchangePrefill?: ComplaintExchangePrefillState } | null;
    const p = st?.complaintExchangePrefill;
    if (!p || exchangePrefillAppliedRef.current) return;
    exchangePrefillAppliedRef.current = true;
    exchangeContextRef.current = p;
    setExchangeFromComplaint(true);
    setExchangeComplaintId(p.complaintId);
    setApiTenantId(p.tenantId);
    setFirstName(p.firstName);
    setLastName(p.lastName);
    setPhone(p.phone);
    setEmail(p.email);
    setBilling_street(p.billingStreet);
    setSource("Reklamacja");

    if (p.lines.length === 0) return;

    let cancelled = false;
    void (async () => {
      const built: LineRow[] = [];
      for (const line of p.lines) {
        if (cancelled) break;
        try {
          const r = await api.get<Record<string, unknown>>(`/products/${line.productId}/`, {
            params: { tenant_id: p.tenantId },
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
          built.push({
            lineKey: `p-${line.productId}`,
            kind: "product",
            product: cp,
            quantity: line.quantity,
            unit_price: price,
          });
        } catch {
          /* produkt niedostępny — użytkownik doda ręcznie */
        }
      }
      if (!cancelled) setLines(built);
    })();
    return () => {
      cancelled = true;
    };
  }, [location.state]);

  useEffect(() => {
    if (!warehouseId) {
      setShippingMethods([]);
      return;
    }
    void getShippingMethods({ tenant_id: apiTenantId, warehouse_id: warehouseId, active_only: true })
      .then((list) =>
        setShippingMethods(list.map((x) => ({ id: x.id, name: x.name, logo_url: x.logo_url ?? null }))),
      )
      .catch(() => setShippingMethods([]));
  }, [warehouseId, apiTenantId]);

  const loadPanelSummary = useCallback(async () => {
    if (warehouse?.id == null) {
      setPanelSummary(null);
      return;
    }
    try {
      const [s, sg] = await Promise.all([
        getOrderUiStatusSummary(DAMAGE_TENANT_ID, warehouse.id),
        getOrderPanelSubgroups(DAMAGE_TENANT_ID, warehouse.id),
      ]);
      setPanelSummary(s);
      setPanelSubgroups(sg);
    } catch {
      setPanelSummary(null);
      setPanelSubgroups(null);
    }
  }, [warehouse?.id]);

  useEffect(() => {
    void loadPanelSummary();
  }, [loadPanelSummary]);

  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      setSearchLoading(true);
      const base = { tenant_id: apiTenantId, limit: 18 };
      Promise.all([
        api.get<unknown>("/products/", { params: { ...base, name: q } }),
        api.get<unknown>("/products/", { params: { ...base, symbol: q } }),
        /^\d[\d\s-]{5,}$/.test(q.replace(/\s/g, ""))
          ? api.get<unknown>("/products/", { params: { ...base, ean: q.replace(/\s/g, "") } })
          : Promise.resolve({ data: [] }),
        api.get<unknown>("/bundles/", { params: { tenant_id: apiTenantId, search: q, active_filter: "active" } }),
      ])
        .then(([r1, r2, r3, rB]) => {
          const map = new Map<number, CatalogProduct>();
          for (const p of parseProductsResponse(r1.data)) map.set(p.id, p);
          for (const p of parseProductsResponse(r2.data)) map.set(p.id, p);
          for (const p of parseProductsResponse(r3.data)) map.set(p.id, p);
          const hits: SearchHit[] = [];
          for (const b of parseBundlesResponse(rB.data)) {
            hits.push({ type: "bundle", bundle: b });
          }
          for (const p of map.values()) {
            hits.push({ type: "product", product: p });
          }
          setSearchResults(hits.slice(0, 24));
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 280);
    return () => window.clearTimeout(t);
  }, [searchQ, apiTenantId]);

  const goodsTotal = useMemo(() => lines.reduce((s, l) => s + l.quantity * l.unit_price, 0), [lines]);

  const shippingNum = useMemo(() => {
    const n = parseFloat(shippingCost.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [shippingCost]);

  const totalAmount = useMemo(() => goodsTotal + shippingNum, [goodsTotal, shippingNum]);

  const hasBuyerOrAddressInput = useCallback(() => {
    return (
      !!firstName.trim() ||
      !!lastName.trim() ||
      !!phone.trim() ||
      !!email.trim() ||
      !!companyName.trim() ||
      !!orderNip.trim() ||
      !!billing_street.trim() ||
      !!billing_city.trim() ||
      !!billing_postal_code.trim() ||
      (!shipSameAsBilling && !!shipping_street.trim())
    );
  }, [
    firstName,
    lastName,
    phone,
    email,
    companyName,
    orderNip,
    billing_street,
    billing_city,
    billing_postal_code,
    shipSameAsBilling,
    shipping_street,
  ]);

  const handleCustomerSelect = useCallback(
    async (raw: string) => {
      if (!raw) {
        setSelectedCustomerId(null);
        setCustomerShippingAddresses([]);
        setSelectedShippingAddressIndex(0);
        setCompanyName("");
        setOrderNip("");
        return;
      }
      const id = parseInt(raw, 10);
      if (!Number.isFinite(id) || id < 1) return;
      if (hasBuyerOrAddressInput()) {
        const ok = window.confirm(
          "Wybrane dane kupującego lub adresu zostaną zastąpione danymi z karty klienta. Kontynuować?",
        );
        if (!ok) {
          setCustomerSelectKey((k) => k + 1);
          return;
        }
      }
      setCustomerSelectBusy(true);
      setError(null);
      try {
        const c = await getCustomer(id, apiTenantId);
        console.log("CLIENT SELECTED", c);
        setFirstName(c.first_name ?? "");
        setLastName(c.last_name ?? "");
        setPhone(c.phone ?? "");
        setEmail(c.email ?? "");
        setCompanyName((c.company_name || "").trim());
        setOrderNip((c.nip || "").trim());

        const addrs = Array.isArray(c.addresses) ? c.addresses : [];
        setCustomerShippingAddresses(addrs);
        const defIdx = addrs.findIndex((a) => a.is_default);
        const billingIdx = defIdx >= 0 ? defIdx : 0;
        const billingAddr = addrs[billingIdx];
        const shipIdx = defIdx >= 0 ? defIdx : 0;
        setSelectedShippingAddressIndex(shipIdx);

        if (billingAddr) {
          setBilling_street(formatCustomerAddressStreet(billingAddr));
          setBilling_city((billingAddr.city || "").trim());
          setBilling_postal_code((billingAddr.postal_code || "").trim());
          setBilling_country((billingAddr.country_code || c.country_code || "PL").trim().toUpperCase());
        } else {
          setBilling_street("");
          setBilling_city("");
          setBilling_postal_code("");
          setBilling_country((c.country_code || "PL").trim().toUpperCase());
        }

        if (addrs.length <= 1) {
          setShipSameAsBilling(true);
        } else {
          setShipSameAsBilling(false);
          const saddr = addrs[shipIdx] ?? addrs[0];
          if (saddr) {
            setShipping_street(formatCustomerAddressStreet(saddr));
            setShipping_city((saddr.city || "").trim());
            setShipping_postal_code((saddr.postal_code || "").trim());
            setShipping_country((saddr.country_code || "PL").trim().toUpperCase());
          }
        }

        if (c.default_document_type === "INVOICE") setDocumentType("INVOICE");
        else if (c.default_document_type === "RECEIPT") setDocumentType("PARAGON");
        if ((c.preferred_payment_method || "").trim()) setPaymentMethod(c.preferred_payment_method!.trim());
        if (
          c.preferred_shipping_method_id &&
          shippingMethods.some((m) => m.id === c.preferred_shipping_method_id)
        ) {
          setShippingMethodId(c.preferred_shipping_method_id);
        }
        setSelectedCustomerId(id);
      } catch {
        setError("Nie udało się wczytać danych klienta.");
        setCustomerSelectKey((k) => k + 1);
      } finally {
        setCustomerSelectBusy(false);
      }
    },
    [apiTenantId, hasBuyerOrAddressInput, shippingMethods],
  );

  const onPickCustomerShippingAddress = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const idx = parseInt(e.target.value, 10);
      if (!Number.isFinite(idx) || idx < 0 || idx >= customerShippingAddresses.length) return;
      setSelectedShippingAddressIndex(idx);
      setShipSameAsBilling(false);
      const a = customerShippingAddresses[idx];
      if (!a) return;
      setShipping_street(formatCustomerAddressStreet(a));
      setShipping_city((a.city || "").trim());
      setShipping_postal_code((a.postal_code || "").trim());
      setShipping_country((a.country_code || "PL").trim().toUpperCase());
    },
    [customerShippingAddresses],
  );

  const addSearchHit = useCallback((hit: SearchHit) => {
    if (hit.type === "product") {
      const p = hit.product;
      const price = p.sale_price != null && Number.isFinite(p.sale_price) ? Number(p.sale_price) : 0;
      const key = `p-${p.id}`;
      setLines((prev) => {
        const i = prev.findIndex((x) => x.lineKey === key);
        if (i >= 0) {
          const next = [...prev];
          const row = next[i];
          if (row.kind === "product") next[i] = { ...row, quantity: row.quantity + 1 };
          return next;
        }
        return [...prev, { lineKey: key, kind: "product", product: p, quantity: 1, unit_price: price }];
      });
    } else {
      const b = hit.bundle;
      const price = b.sale_price != null && Number.isFinite(b.sale_price) ? Number(b.sale_price) : 0;
      const key = `b-${b.id}`;
      setLines((prev) => {
        const i = prev.findIndex((x) => x.lineKey === key);
        if (i >= 0) {
          const next = [...prev];
          const row = next[i];
          if (row.kind === "bundle") next[i] = { ...row, quantity: row.quantity + 1 };
          return next;
        }
        return [...prev, { lineKey: key, kind: "bundle", bundle: b, quantity: 1, unit_price: price }];
      });
    }
    setSearchQ("");
    setSearchResults([]);
  }, []);

  const setQty = useCallback((lineKey: string, qty: number) => {
    const q = Math.floor(qty);
    setLines((prev) => {
      if (q <= 0) return prev.filter((l) => l.lineKey !== lineKey);
      return prev.map((l) => (l.lineKey === lineKey ? { ...l, quantity: q } : l));
    });
  }, []);

  const setLinePrice = useCallback((lineKey: string, price: number) => {
    setLines((prev) =>
      prev.map((l) => (l.lineKey === lineKey ? { ...l, unit_price: Math.max(0, price) } : l)),
    );
  }, []);

  const removeLine = useCallback((lineKey: string) => {
    setLines((prev) => prev.filter((l) => l.lineKey !== lineKey));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (lines.length === 0) {
      setError("Dodaj co najmniej jeden produkt.");
      return;
    }
    if (lines.some((l) => l.quantity <= 0)) {
      setError("Ilości muszą być większe od zera.");
      return;
    }
    if (!shipSameAsBilling) {
      if (
        !shipping_street.trim() ||
        !shipping_city.trim() ||
        !shipping_postal_code.trim()
      ) {
        setError("Uzupełnij adres dostawy: ulica, kod pocztowy i miejscowość.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const ex = exchangeContextRef.current;
      const shipStreet = shipSameAsBilling ? billing_street : shipping_street;
      const shipCity = shipSameAsBilling ? billing_city : shipping_city;
      const shipPostal = shipSameAsBilling ? billing_postal_code : shipping_postal_code;
      const shipCountry = shipSameAsBilling ? billing_country : shipping_country;
      const orderPayload = {
        tenant_id: ex?.tenantId ?? apiTenantId,
        warehouse_id: warehouseId,
        login: login.trim() || null,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        source: source.trim() || null,
        note: note.trim() || null,
        comment: comment.trim() || null,
        shipping_cost: shippingNum,
        company_name: companyName.trim() || null,
        nip: orderNip.trim() || null,
        billing_street: billing_street.trim() || null,
        billing_city: billing_city.trim() || null,
        billing_postal_code: billing_postal_code.trim() || null,
        billing_country: billing_country.trim() || null,
        shipping_street: shipStreet.trim() || null,
        shipping_city: shipCity.trim() || null,
        shipping_postal_code: shipPostal.trim() || null,
        shipping_country: shipCountry.trim() || null,
        items: lines.map((l) =>
          l.kind === "product"
            ? { product_id: l.product.id, quantity: l.quantity, unit_price: l.unit_price }
            : { bundle_id: l.bundle.id, quantity: l.quantity, unit_price: l.unit_price },
        ),
        shipping_method_id: shippingMethodId.trim() || null,
        document_type:
          documentType === "PARAGON" || documentType === "INVOICE" ? documentType : undefined,
        payment_method: paymentMethod.trim() || undefined,
        payment_status: paymentStatus.trim() || undefined,
        sales_document_number: salesDocumentNumber.trim() || undefined,
        check_bundle_stock: checkBundleStock,
        customer_id: selectedCustomerId ?? undefined,
        ...(ex
          ? {
              origin: "COMPLAINT",
              complaint_id: ex.complaintId,
              original_order_id: ex.originalOrderId,
              complaint_order_type: ex.complaintOrderKind,
            }
          : {}),
      };
      console.log("ORDER AFTER MAP", orderPayload);
      const res = await createOrder(orderPayload);
      if (ex?.complaintLineId != null) {
        try {
          await patchComplaintLine(ex.complaintId, ex.complaintLineId, ex.tenantId, ex.warehouseId, {
            decision: "exchange",
          });
          await updateLineOperation(ex.complaintLineId, ex.tenantId, ex.warehouseId, "EXCHANGE_ORDER_PLACED");
        } catch {
          try {
            await patchComplaintLine(ex.complaintId, ex.complaintLineId, ex.tenantId, ex.warehouseId, {
              decision: "exchange",
            });
          } catch {
            /* zamówienie utworzone */
          }
        }
      }
      navigate(`/orders/${res.id}`, { replace: true });
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

  const selectedShip = useMemo(
    () => shippingMethods.find((m) => m.id === shippingMethodId.trim()),
    [shippingMethods, shippingMethodId],
  );
  const docTypeSummary =
    documentType === "INVOICE" ? "Faktura" : documentType === "PARAGON" ? "Paragon" : "—";

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-col gap-5 bg-[#f4f7f9] pb-8 lg:flex-row lg:items-start lg:gap-2">
      {warehouse?.id != null ? (
        <OrdersPanelStatusSidebar
          warehouseId={warehouse.id}
          panelSummary={panelSummary}
          panelSubgroups={panelSubgroups}
          panelFilter="all"
          onPanelFilterChange={(f: OrderPanelFilter) =>
            navigate("/orders/list", { state: { panelFilter: f } })
          }
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">Nowe zamówienie</h1>
                {exchangeFromComplaint ? (
                  <p className="mt-1 text-sm font-medium text-amber-900">
                    {exchangeContextRef.current?.complaintOrderKind === "REPLACEMENT"
                      ? `Zamówienie z reklamacji (Nowy produkt) #${exchangeComplaintId ?? "—"}`
                      : `Zamówienie z reklamacji (Wymiana) #${exchangeComplaintId ?? "—"}`}{" "}
                    — możesz zmienić produkty i dane przed zapisem.
                  </p>
                ) : null}
              </div>
              <Link to="/orders/list" className="text-sm font-medium text-blue-700 hover:underline">
                ← Lista zamówień
              </Link>
            </div>
            <div className="mt-4 max-w-md">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-500">Status panelu</span>
                <OrderPanelStatusSelect
                  value=""
                  disabled
                  panelSummary={panelSummary}
                  onChange={() => {}}
                />
                <span className="text-xs text-slate-500">
                  Status przypiszesz po utworzeniu zamówienia (z listy lub szczegółów).
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <label className="flex max-w-xl flex-col gap-1">
              <span className="text-xs font-semibold text-slate-500">Klient (opcjonalnie)</span>
              <select
                key={customerSelectKey}
                disabled={customerSelectBusy}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                value={selectedCustomerId ?? ""}
                onChange={(e) => void handleCustomerSelect(e.target.value)}
              >
                <option value="">— Gość / bez karty klienta —</option>
                {customerOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name}
                    {c.email?.trim() ? ` · ${c.email.trim()}` : ""}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">
                Dane i adres wypełnią się z karty — przy ręcznych wpisach pojawi się potwierdzenie.{" "}
                <Link to="/customers/new" className="font-medium text-blue-700 hover:underline">
                  Nowy klient
                </Link>
              </span>
            </label>
            {customerShippingAddresses.length > 1 ? (
              <label className="mt-3 flex max-w-xl flex-col gap-1">
                <span className="text-xs font-semibold text-slate-500">Adres dostawy z karty klienta</span>
                <select
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  value={selectedShippingAddressIndex}
                  onChange={onPickCustomerShippingAddress}
                >
                  {customerShippingAddresses.map((a, idx) => {
                    const line = [formatCustomerAddressStreet(a), (a.city || "").trim()]
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <option key={a.id ?? idx} value={idx}>
                        {line || `Adres ${idx + 1}`}
                        {a.is_default ? " (domyślny)" : ""}
                      </option>
                    );
                  })}
                </select>
                <span className="text-xs text-slate-500">
                  Adres rozliczeniowy bierze się z adresu domyślnego na karcie; tutaj wybierasz wysyłkę.
                </span>
              </label>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Kupujący</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-600">Login</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Imię</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Nazwisko</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Telefon</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">E-mail</span>
              <input
                type="email"
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Firma</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                autoComplete="organization"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">NIP</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={orderNip}
                onChange={(e) => setOrderNip(e.target.value)}
                autoComplete="off"
              />
            </label>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Dostawa i płatność</h3>
              <div className="mt-3 flex items-start gap-3">
                <ShippingMethodLogo
                  logoUrl={selectedShip?.logo_url ?? undefined}
                  methodName={selectedShip?.name ?? "—"}
                  size="md"
                />
                <div className="min-w-0 flex-1 space-y-2 text-sm">
                  <div>
                    <span className="text-xs text-slate-500">Metoda dostawy</span>
                    <p className="font-semibold text-slate-900">{selectedShip?.name?.trim() || "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Metoda płatności</span>
                    <p className="font-medium text-slate-800">{paymentMethod.trim() || "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Status płatności</span>
                    <p className="font-medium text-slate-800">{paymentStatus.trim() || "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Typ dokumentu</span>
                    <p className="font-medium text-slate-800">{docTypeSummary}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Adres rozliczeniowy</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Ulica i numer</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={billing_street}
                onChange={(e) => setBilling_street(e.target.value)}
                autoComplete="street-address"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Kod pocztowy</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={billing_postal_code}
                onChange={(e) => setBilling_postal_code(e.target.value)}
                autoComplete="postal-code"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Miejscowość</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={billing_city}
                onChange={(e) => setBilling_city(e.target.value)}
                autoComplete="address-level2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Kraj (opcjonalnie)</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={billing_country}
                onChange={(e) => setBilling_country(e.target.value)}
                autoComplete="country-name"
              />
            </label>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 rounded border-slate-300 text-blue-600"
              checked={shipSameAsBilling}
              onChange={(e) => {
                const checked = e.target.checked;
                setShipSameAsBilling(checked);
                if (!checked) {
                  setShipping_street((prev) => prev.trim() || billing_street);
                  setShipping_city((prev) => prev.trim() || billing_city);
                  setShipping_postal_code((prev) => prev.trim() || billing_postal_code);
                  setShipping_country((prev) => prev.trim() || billing_country);
                }
              }}
            />
            <span className="text-slate-700">Adres dostawy taki sam jak rozliczeniowy</span>
          </label>

          {!shipSameAsBilling ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Adres dostawy</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  <span className="text-slate-600">Ulica i numer</span>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={shipping_street}
                    onChange={(e) => setShipping_street(e.target.value)}
                    autoComplete="shipping street-address"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Kod pocztowy</span>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={shipping_postal_code}
                    onChange={(e) => setShipping_postal_code(e.target.value)}
                    autoComplete="shipping postal-code"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Miejscowość</span>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={shipping_city}
                    onChange={(e) => setShipping_city(e.target.value)}
                    autoComplete="shipping address-level2"
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="text-slate-600">Kraj (opcjonalnie)</span>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={shipping_country}
                    onChange={(e) => setShipping_country(e.target.value)}
                    autoComplete="shipping country-name"
                  />
                </label>
              </div>
            </div>
          ) : null}
            </div>

            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Dokument i źródło</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  <span className="text-slate-600">Źródło</span>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="text-slate-600">Numer dokumentu sprzedaży</span>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={salesDocumentNumber}
                    onChange={(e) => setSalesDocumentNumber(e.target.value)}
                    placeholder="np. FS/2024/12/1"
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="text-slate-600">Notatka</span>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="text-slate-600">Komentarz</span>
                  <textarea
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Produkty</h2>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Link
                  to="/products/list"
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Dodaj produkt
                </Link>
                <Link
                  to="/bundles"
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Dodaj zestaw
                </Link>
                <span
                  className="cursor-not-allowed rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-400"
                  title="Zapisz zamówienie, aby otworzyć pakowanie WMS"
                >
                  Spakuj
                </span>
              </div>
            </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,22rem)] lg:items-start">
            <div className="min-w-0">
          <input
            type="search"
            placeholder="Szukaj po nazwie, SKU lub EAN…"
            className="mb-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            autoComplete="off"
          />
          {searchLoading && <p className="text-xs text-slate-500">Szukanie…</p>}
          {searchResults.length > 0 && (
            <ul className="mb-4 max-h-72 overflow-auto rounded-lg border border-slate-100 bg-slate-50/80">
              {searchResults.map((hit) => {
                if (hit.type === "bundle") {
                  const b = hit.bundle;
                  const price = b.sale_price != null ? Number(b.sale_price).toFixed(2) : "—";
                  return (
                    <li key={`b-${b.id}`}>
                      <button
                        type="button"
                        onClick={() => addSearchHit(hit)}
                        className="flex w-full gap-3 border-b border-slate-100 px-3 py-2 text-left transition hover:bg-white"
                      >
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-violet-200 bg-violet-50 text-xs font-bold text-violet-800">
                          ZESTAW
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-slate-800">{b.name}</div>
                          <div className="text-xs text-slate-500">
                            EAN {b.ean || "—"} · SKU {b.sku || "—"}
                          </div>
                          <div className="mt-0.5 text-xs font-medium text-violet-800">
                            Wirtualny zestaw (rozbijany na produkty) · Cena: {price} zł
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                }
                const p = hit.product;
                const img = firstImageUrl(p.image_url ?? undefined);
                const sku = (p.sku || p.symbol || "—") as string;
                const avail = p.stock_quantity ?? 0;
                const price = p.sale_price != null ? Number(p.sale_price).toFixed(2) : "—";
                return (
                  <li key={`p-${p.id}`}>
                    <button
                      type="button"
                      onClick={() => addSearchHit(hit)}
                      className="flex w-full gap-3 border-b border-slate-100 px-3 py-2 text-left transition hover:bg-white"
                    >
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded border border-slate-200 bg-white">
                        {img ? (
                          <img src={img} alt="" className="h-full w-full object-contain" loading="lazy" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">—</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium text-slate-800">{p.name || `ID ${p.id}`}</span>
                          <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
                            Produkt
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          EAN {p.ean || "—"} · SKU {sku}
                        </div>
                        <div className="mt-0.5 text-xs font-medium text-slate-700">
                          Dostępne: {avail} · Cena: {price} zł
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {lines.length === 0 ? (
            <p className="text-sm text-slate-500">Brak pozycji — wyszukaj produkt lub zestaw z asortymentu.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="pb-2 pr-2">Produkt</th>
                    <th className="pb-2 pr-2">Cena j.</th>
                    <th className="pb-2 pr-2">Ilość</th>
                    <th className="pb-2 pr-2">Suma</th>
                    <th className="w-10 pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.lineKey} className="border-b border-slate-100">
                      <td className="py-2 pr-2">
                        {l.kind === "bundle" ? (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-slate-800">{l.bundle.name}</span>
                              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-900">
                                Zestaw
                              </span>
                            </div>
                            <div className="text-xs text-slate-500">
                              {l.bundle.ean || "—"} · {l.bundle.sku || "—"}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-medium text-slate-800">{l.product.name}</div>
                            <div className="text-xs text-slate-500">
                              {l.product.ean || "—"} · {l.product.symbol || l.product.sku || "—"}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="w-24 rounded border border-slate-200 px-2 py-1"
                          value={l.unit_price}
                          onChange={(e) => setLinePrice(l.lineKey, parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="w-20 rounded border border-slate-200 px-2 py-1"
                          value={l.quantity}
                          onChange={(e) => setQty(l.lineKey, parseInt(e.target.value, 10) || 0)}
                        />
                      </td>
                      <td className="py-2 pr-2 font-medium">{(l.quantity * l.unit_price).toFixed(2)} zł</td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => removeLine(l.lineKey)}
                          className="rounded p-1.5 text-red-600 hover:bg-red-50"
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
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 text-sm">
            <span className="font-semibold text-slate-600">Razem </span>
            <span className="text-base font-extrabold tabular-nums text-slate-900">{goodsTotal.toFixed(2)} zł</span>
          </div>
            </div>

            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Wysyłka i płatność</h3>
              <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
                Typ dokumentu
                <select
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="PARAGON">Paragon</option>
                  <option value="INVOICE">Faktura</option>
                </select>
              </label>
              <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
                Metoda płatności
                <select
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="">—</option>
                  {Array.from(
                    new Set(
                      [...PAYMENT_METHOD_PRESETS, paymentMethod].filter((x) => (x || "").trim().length > 0),
                    ),
                  ).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
                Status płatności
                <select
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                >
                  <option value="">—</option>
                  {Array.from(
                    new Set(
                      [...PAYMENT_STATUS_PRESETS, paymentStatus].filter((x) => (x || "").trim().length > 0),
                    ),
                  ).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
                Metoda dostawy
                <select
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                  value={shippingMethodId}
                  onChange={(e) => setShippingMethodId(e.target.value)}
                >
                  <option value="">— brak —</option>
                  {shippingMethods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
                Koszt wysyłki (zł)
                <input
                  type="text"
                  inputMode="decimal"
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                />
              </label>
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Listy przewozowe</h3>
              <p className="mt-3 text-sm text-slate-500">Brak wygenerowanych etykiet.</p>
            </div>
            <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Dopasowane opakowania</h3>
              <p className="mt-3 text-sm text-slate-500">Wybór kartonu po utworzeniu zamówienia.</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Podsumowanie zamówienia</h3>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1 rounded border-slate-300 text-blue-600"
                checked={checkBundleStock}
                onChange={(e) => setCheckBundleStock(e.target.checked)}
              />
              <span>
                Sprawdź stan magazynowy przed zapisem (produkty + składowe zestawów w tym magazynie). Zapis zostanie
                odrzucony przy braku ilości.
              </span>
            </label>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-600">Wartość towarów</span>
                <span className="font-semibold tabular-nums text-slate-900">{goodsTotal.toFixed(2)} zł</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-600">Koszt dostawy</span>
                <span className="font-semibold tabular-nums text-slate-900">{shippingNum.toFixed(2)} zł</span>
              </div>
              <div className="flex justify-between gap-4 border-t border-slate-100 pt-2 text-base font-extrabold">
                <span className="text-slate-800">Razem</span>
                <span className="tabular-nums text-slate-900">{totalAmount.toFixed(2)} zł</span>
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || lines.length === 0}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Zapisywanie…" : "Utwórz zamówienie"}
          </button>
          <Link
            to="/orders/list"
            className="rounded-lg border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Anuluj
          </Link>
        </div>
      </form>
      </div>
    </div>
  );
}
