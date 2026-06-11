import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import api from "../../api/axios";
import { createWmsReturn } from "../../api/wmsReturnsApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { resolveDamageMediaUrl } from "../../utils/resolveDamageMediaUrl";
import { WMS_ROUTES } from "./wmsRoutes";
import { displayWarehouseDocumentNumber } from "../../utils/warehouseDocumentNumberDisplay";
import { formatWmsListDate } from "./wmsListFormatters";

type OrderItemRow = {
  id: number;
  quantity: number;
  product: {
    id: number;
    name?: string | null;
    ean?: string | null;
    sku?: string | null;
    symbol?: string | null;
    image_url?: string | null;
  };
};

type OrderDetail = {
  id: number;
  warehouse_id?: number;
  number?: string | null;
  order_date?: string | null;
  created_at?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  source?: string | null;
  addresses_json?: string | null;
  items: OrderItemRow[];
};

function headerCustomerFromOrder(o: OrderDetail): string {
  const a = (o.first_name || "").trim();
  const b = (o.last_name || "").trim();
  if (a && b) return `${a} ${b}`;
  if (a) return a;
  if (b) return b;
  return "Brak danych klienta";
}

function orderTileContactFromAddresses(raw: string | null | undefined): { phone: string | null; email: string | null } {
  if (!raw?.trim()) return { phone: null, email: null };
  try {
    const data = JSON.parse(raw) as { shipping?: { phone?: string; email?: string }; billing?: { phone?: string; email?: string } };
    const ship = data.shipping ?? {};
    const bill = data.billing ?? {};
    const phone = (ship.phone || bill.phone || "").trim() || null;
    const email = (ship.email || bill.email || "").trim() || null;
    return { phone, email };
  } catch {
    return { phone: null, email: null };
  }
}

export default function WmsReturnCreatePage() {
  const { orderId: orderIdParam } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const orderId = orderIdParam ? Number(orderIdParam) : NaN;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [qtyByItem, setQtyByItem] = useState<Record<number, number>>({});
  const [newReturnType, setNewReturnType] = useState<"RMA" | "UNCLAIMED">("RMA");
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const firstQtyRef = useRef<HTMLInputElement | null>(null);

  const loadOrder = useCallback(async () => {
    if (!Number.isFinite(orderId) || orderId <= 0) {
      setLoadErr("Nieprawidłowy identyfikator zamówienia.");
      setOrder(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await api.get<OrderDetail>(`orders/${orderId}/`);
      setOrder(res.data);
      const init: Record<number, number> = {};
      for (const it of res.data.items) init[it.id] = 0;
      setQtyByItem(init);
    } catch {
      setOrder(null);
      setLoadErr("Nie udało się wczytać zamówienia.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    if (!order || loading) return;
    const id = window.requestAnimationFrame(() => firstQtyRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [order, loading]);

  const linesForCreate = useMemo(() => {
    if (!order) return [];
    return order.items
      .filter((it) => (qtyByItem[it.id] ?? 0) > 0)
      .map((it) => ({
        order_item_id: it.id,
        product_id: it.product.id,
        quantity: Math.min(Math.max(1, Math.floor(qtyByItem[it.id] ?? 0)), it.quantity),
      }));
  }, [order, qtyByItem]);

  const setQty = (itemId: number, value: number, max: number) => {
    const v = Math.max(0, Math.min(max, Math.floor(value)));
    setQtyByItem((prev) => ({ ...prev, [itemId]: v }));
  };

  const firstQtyRowIndex = useMemo(() => {
    if (!order) return -1;
    return order.items.findIndex((x) => x.quantity > 0);
  }, [order]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || linesForCreate.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const r = await createWmsReturn({
        tenant_id: DAMAGE_TENANT_ID,
        order_id: order.id,
        return_type: newReturnType,
        lines: linesForCreate,
      });
      const rmzLabel = displayWarehouseDocumentNumber(r.rmz_number) || (r.rmz_number || "").trim() || `RMZ #${r.id}`;
      toast.success(`Utworzono zwrot ${rmzLabel}`);
      navigate(WMS_ROUTES.returns, {
        replace: true,
        state: { preselectOrderId: order.id, highlightReturnId: r.id },
      });
    } catch (err: unknown) {
      let msg = "Nie udało się utworzyć zwrotu.";
      if (typeof err === "object" && err !== null && "response" in err) {
        const d = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
        if (typeof d === "string" && d.trim()) msg = d.trim();
      }
      setSubmitErr(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const orderDateLine = formatWmsListDate(order?.order_date ?? order?.created_at ?? null);
  const contact = orderTileContactFromAddresses(order?.addresses_json);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-slate-800">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 md:px-6">
        <Link
          to={WMS_ROUTES.returns}
          className="mb-3 inline-flex text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          ← Wróć do zwrotów
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Nowy zwrot</h1>
        <p className="mt-1 text-sm text-slate-600">Wybierz produkty i ilości do zwrotu, następnie zapisz dokument RMZ.</p>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
        {loading ? (
          <p className="text-sm text-slate-500">Wczytywanie zamówienia…</p>
        ) : loadErr || !order ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-900">
            {loadErr ?? "Brak danych zamówienia."}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-6">
            <div className="rounded-xl border-2 border-slate-200/90 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div>
                  <div className="text-2xl font-bold tabular-nums text-slate-900">#{order.number ?? order.id}</div>
                  {orderDateLine ? <div className="text-sm text-slate-500 tabular-nums">{orderDateLine}</div> : null}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-semibold text-slate-900">{headerCustomerFromOrder(order)}</div>
                  {contact.phone ? <div className="text-slate-600">{contact.phone}</div> : null}
                  {contact.email ? <div className="break-all text-slate-600">{contact.email}</div> : null}
                </div>
              </div>
            </div>

            <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
              <div>
                <label htmlFor="return-type" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Rodzaj zwrotu
                </label>
                <select
                  id="return-type"
                  value={newReturnType}
                  onChange={(e) => setNewReturnType(e.target.value as "RMA" | "UNCLAIMED")}
                  className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="RMA">Zwrot</option>
                  <option value="UNCLAIMED">Nieodebrane</option>
                </select>
              </div>

              {submitErr ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
                  {submitErr}
                </p>
              ) : null}

              <div className="space-y-3">
                {order.items.map((it, ii) => {
                  const p = it.product;
                  const imgRaw = (p.image_url || "").trim();
                  const imgSrc = imgRaw ? resolveDamageMediaUrl(imgRaw) : "";
                  const skuLine = ((p.sku || "").trim() || (p.symbol || "").trim()) || "—";
                  const noOrderQty = it.quantity <= 0;
                  return (
                    <div
                      key={it.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 shadow-sm ${
                        noOrderQty ? "border-slate-200 bg-slate-100/80 opacity-60" : "border-slate-100 bg-slate-50/80"
                      }`}
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200/80">
                        {imgSrc ? (
                          <img src={imgSrc} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-400" aria-hidden>
                            —
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-900">{p.name ?? "—"}</div>
                        <div className="text-xs text-slate-500">SKU: {skuLine}</div>
                        <div className="text-xs text-slate-500">EAN: {(p.ean || "").trim() || "—"}</div>
                        <div className="text-xs text-slate-500">
                          W zamów.: <span className="font-medium tabular-nums">{it.quantity}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-xs font-semibold text-slate-600">Do zwrotu</span>
                        <input
                          ref={ii === firstQtyRowIndex ? firstQtyRef : undefined}
                          type="number"
                          min={0}
                          max={it.quantity}
                          value={qtyByItem[it.id] ?? 0}
                          onChange={(e) => setQty(it.id, Number(e.target.value), it.quantity)}
                          disabled={noOrderQty || submitting}
                          className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-2 text-center text-base tabular-nums shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:bg-slate-100"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => navigate(WMS_ROUTES.returns)}
                  disabled={submitting}
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={linesForCreate.length === 0 || submitting}
                  className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Zapisywanie…" : "Zapisz RMZ"}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
