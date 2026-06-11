import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

import api from "../../api/axios";
import { createWmsReturn, listWmsReturnsForOrder } from "../../api/wmsReturnsApi";
import type { WmsReturnListItem, WmsReturnRead } from "../../types/wmsReturn";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { resolveDamageMediaUrl } from "../../utils/resolveDamageMediaUrl";
import { displayWarehouseDocumentNumber } from "../../utils/warehouseDocumentNumberDisplay";
import { WMS_ROUTES } from "./wmsRoutes";

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
  number?: string | null;
  items: OrderItemRow[];
};

export type DraftRmzLine = {
  orderItemId: number;
  productId: number;
  quantity: number;
  productName: string;
  imageUrl?: string;
  orderQuantity: number;
  returnedQuantity: number;
};

type Props = {
  orderId: number;
  onCreated: (created: WmsReturnRead) => void;
};

function sumReturnedQtyByOrderItem(returns: WmsReturnListItem[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const ret of returns) {
    const rows: { order_item_id?: number; quantity?: number }[] =
      ret.lines && ret.lines.length > 0
        ? ret.lines
        : [];
    for (const row of rows) {
      const oi = row.order_item_id;
      const q = Number(row.quantity);
      if (oi == null || !Number.isFinite(oi) || !Number.isFinite(q) || q <= 0) continue;
      map.set(oi, (map.get(oi) ?? 0) + Math.floor(q));
    }
  }
  return map;
}

export function WmsReturnDraftPhase({ orderId, onCreated }: Props) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [returnedByItem, setReturnedByItem] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draftLines, setDraftLines] = useState<DraftRmzLine[]>([]);
  const [addQtyByItem, setAddQtyByItem] = useState<Record<number, number>>({});
  const [newReturnType, setNewReturnType] = useState<"RMA" | "UNCLAIMED">("RMA");
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(orderId) || orderId <= 0) {
      setLoadErr("Nieprawidłowy identyfikator zamówienia.");
      setOrder(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadErr(null);
    try {
      const [orderRes, returns] = await Promise.all([
        api.get<OrderDetail>(`orders/${orderId}/`),
        listWmsReturnsForOrder(orderId, DAMAGE_TENANT_ID),
      ]);
      setOrder(orderRes.data);
      setReturnedByItem(sumReturnedQtyByOrderItem(returns));
      const initQty: Record<number, number> = {};
      for (const it of orderRes.data.items) initQty[it.id] = 0;
      setAddQtyByItem(initQty);
      setDraftLines([]);
    } catch {
      setOrder(null);
      setLoadErr("Nie udało się wczytać zamówienia.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const draftQtyByItem = useMemo(() => {
    const map = new Map<number, number>();
    for (const line of draftLines) {
      map.set(line.orderItemId, (map.get(line.orderItemId) ?? 0) + line.quantity);
    }
    return map;
  }, [draftLines]);

  const remainingByItem = useCallback(
    (item: OrderItemRow) => {
      const ordered = Math.max(0, Math.floor(item.quantity));
      const returned = returnedByItem.get(item.id) ?? 0;
      const inDraft = draftQtyByItem.get(item.id) ?? 0;
      return Math.max(0, ordered - returned - inDraft);
    },
    [returnedByItem, draftQtyByItem],
  );

  const addItemToDraft = (item: OrderItemRow) => {
    const remaining = remainingByItem(item);
    const raw = addQtyByItem[item.id] ?? 0;
    const qty = Math.max(0, Math.min(remaining, Math.floor(raw)));
    if (qty <= 0 || remaining <= 0) return;

    const p = item.product;
    const imgRaw = (p.image_url || "").trim();
    const line: DraftRmzLine = {
      orderItemId: item.id,
      productId: p.id,
      quantity: qty,
      productName: (p.name || "").trim() || `Produkt #${p.id}`,
      imageUrl: imgRaw || undefined,
      orderQuantity: item.quantity,
      returnedQuantity: returnedByItem.get(item.id) ?? 0,
    };

    setDraftLines((prev) => {
      const idx = prev.findIndex((x) => x.orderItemId === item.id);
      if (idx < 0) return [...prev, line];
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
      return next;
    });
    setAddQtyByItem((prev) => ({ ...prev, [item.id]: 0 }));
  };

  const removeDraftLine = (orderItemId: number) => {
    setDraftLines((prev) => prev.filter((x) => x.orderItemId !== orderItemId));
  };

  const handleSaveRmz = async () => {
    if (!order || draftLines.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const lines = draftLines.map((l) => ({
        order_item_id: l.orderItemId,
        product_id: l.productId,
        quantity: l.quantity,
      }));
      const created = await createWmsReturn({
        tenant_id: DAMAGE_TENANT_ID,
        order_id: order.id,
        return_type: newReturnType,
        lines,
      });
      const label = displayWarehouseDocumentNumber(created.rmz_number) || created.rmz_number || `RMZ #${created.id}`;
      toast.success(`Utworzono zwrot ${label}`);
      onCreated(created);
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

  const orderLabel = order ? `#${(order.number ?? "").trim() || order.id}` : "—";

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-10 text-center text-sm text-slate-600">Wczytywanie zamówienia…</div>
    );
  }

  if (loadErr || !order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-900">{loadErr ?? "Brak danych."}</div>
        <Link to={WMS_ROUTES.returns} className="mt-4 inline-block text-sm font-semibold text-slate-600 hover:text-slate-900">
          ← Wróć do zwrotów
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-col px-4 pb-6 pt-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          to={WMS_ROUTES.returns}
          state={{ preselectOrderId: order.id }}
          className="text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          ← Wróć
        </Link>
        <div>
          <h1 className="text-xl font-black text-slate-900 md:text-2xl">Nowy zwrot · {orderLabel}</h1>
          <p className="text-sm text-slate-600">Dodaj produkty do RMZ, następnie zapisz dokument.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="draft-return-type" className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
            Rodzaj zwrotu
          </label>
          <select
            id="draft-return-type"
            value={newReturnType}
            onChange={(e) => setNewReturnType(e.target.value as "RMA" | "UNCLAIMED")}
            disabled={submitting}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
          >
            <option value="RMA">Zwrot</option>
            <option value="UNCLAIMED">Nieodebrane</option>
          </select>
        </div>
      </div>

      {submitErr ? (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {submitErr}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="flex min-h-[320px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Do dodania</h2>
          </header>
          <ul className="custom-scrollbar flex-1 space-y-2 overflow-y-auto p-3">
            {order.items.map((it) => {
              const remaining = remainingByItem(it);
              const returned = returnedByItem.get(it.id) ?? 0;
              const exhausted = remaining <= 0;
              const p = it.product;
              const imgSrc = (p.image_url || "").trim() ? resolveDamageMediaUrl((p.image_url || "").trim()) : "";
              return (
                <li
                  key={it.id}
                  className={`rounded-xl border p-3 ${exhausted ? "border-slate-100 bg-slate-50 opacity-50" : "border-slate-100 bg-slate-50/80"}`}
                >
                  <div className="flex gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
                      {imgSrc ? (
                        <img src={imgSrc} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">—</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-900">{p.name ?? "—"}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        Zakupiono: <span className="font-semibold tabular-nums">{it.quantity}</span>
                        {" · "}
                        Zwrócono: <span className="font-semibold tabular-nums">{returned}</span>
                      </div>
                      {!exhausted ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={remaining}
                            value={addQtyByItem[it.id] ?? 0}
                            onChange={(e) =>
                              setAddQtyByItem((prev) => ({
                                ...prev,
                                [it.id]: Math.max(0, Math.min(remaining, Math.floor(Number(e.target.value) || 0))),
                              }))
                            }
                            disabled={submitting}
                            className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm tabular-nums"
                          />
                          <button
                            type="button"
                            disabled={submitting || (addQtyByItem[it.id] ?? 0) <= 0}
                            onClick={() => addItemToDraft(it)}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            Dodaj do RMZ
                          </button>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs font-medium text-slate-500">W RMZ lub już zwrócone</p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex min-h-[320px] flex-col rounded-xl border border-blue-200 bg-blue-50/30 shadow-sm">
          <header className="flex items-center justify-between border-b border-blue-100 px-4 py-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-800">Pozycje RMZ</h2>
            <button
              type="button"
              disabled={draftLines.length === 0 || submitting}
              onClick={() => void handleSaveRmz()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Zapisywanie…" : "Zapisz RMZ"}
            </button>
          </header>
          {draftLines.length === 0 ? (
            <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-600">
              Dodaj produkty z lewej kolumny, aby utworzyć dokument RMZ.
            </p>
          ) : (
            <ul className="custom-scrollbar flex-1 space-y-2 overflow-y-auto p-3">
              {draftLines.map((line) => {
                const imgSrc = line.imageUrl ? resolveDamageMediaUrl(line.imageUrl) : "";
                return (
                  <li key={line.orderItemId} className="flex items-center gap-3 rounded-xl border border-blue-200/80 bg-white p-3 shadow-sm">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200">
                      {imgSrc ? (
                        <img src={imgSrc} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">—</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-slate-900">{line.productName}</div>
                      <div className="text-xs text-slate-600">
                        Ilość w RMZ: <span className="font-bold tabular-nums text-blue-700">{line.quantity}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => removeDraftLine(line.orderItemId)}
                      className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Usuń
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
