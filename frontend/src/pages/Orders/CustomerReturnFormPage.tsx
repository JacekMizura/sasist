import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import api from "../../api/axios";
import { createWmsReturn } from "../../api/wmsReturnsApi";
import { formatFastApiErrorDetail } from "../../api/wmsPickingProductsApi";
import { PrimaryButton } from "../../design-system/PrimaryButton";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { ORDER_CASE_RETURN_REASONS } from "../../components/orders/caseCreate/orderCaseCreateConstants";
import { parseShippingAddressBlock } from "../../utils/orderDetailAddress";

type OrderLite = {
  id: number;
  number?: string | null;
  tenant_id?: number;
  warehouse_id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  addresses_json?: string | null;
  items?: Array<{
    id: number;
    quantity: number;
    product?: { id?: number; name?: string | null; sku?: string | null } | null;
    is_bundle_parent?: boolean;
  }>;
};

type LinePick = { selected: boolean; qty: number; reasonId: string; comment: string };

/**
 * Customer-facing return form — simplified screen for the client (or a shared link).
 * Operator create flow stays in Order Panel (`OrderCaseCreateView`).
 */
export default function CustomerReturnFormPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = Number(id);
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<Record<number, LinePick>>({});
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(orderId) || orderId <= 0) {
      setLoading(false);
      setErr("Nieprawidłowe zamówienie.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    void api
      .get<OrderLite>(`/orders/${orderId}`)
      .then((res) => {
        if (cancelled) return;
        const o = res.data;
        setOrder(o);
        const next: Record<number, LinePick> = {};
        for (const it of o.items ?? []) {
          if (it.is_bundle_parent || !it.product?.id) continue;
          const q = Math.max(1, Math.floor(Number(it.quantity) || 1));
          next[it.id] = { selected: false, qty: q, reasonId: "changed_mind", comment: "" };
        }
        setLines(next);
      })
      .catch(() => {
        if (!cancelled) setErr("Nie udało się wczytać zamówienia.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const eligible = useMemo(
    () =>
      (order?.items ?? []).filter((it) => {
        if (it.is_bundle_parent) return false;
        if (!it.product?.id) return false;
        return (Number(it.quantity) || 0) > 0;
      }),
    [order],
  );

  const selectedCount = Object.values(lines).filter((l) => l.selected).length;
  const customerName = [order?.first_name, order?.last_name].filter(Boolean).join(" ").trim() || "Klient";
  const addressLines = parseShippingAddressBlock(order?.addresses_json);

  const submit = async () => {
    if (!order) return;
    const picked = eligible.filter((it) => lines[it.id]?.selected);
    if (picked.length === 0) {
      setErr("Zaznacz co najmniej jeden produkt do zwrotu.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const created = await createWmsReturn({
        tenant_id: order.tenant_id ?? DAMAGE_TENANT_ID,
        warehouse_id: order.warehouse_id ?? undefined,
        order_id: order.id,
        return_type: "RMA",
        lines: picked.map((it) => ({
          order_item_id: it.id,
          product_id: Number(it.product!.id),
          quantity: Math.min(
            Math.max(1, lines[it.id]?.qty ?? 1),
            Math.max(1, Math.floor(Number(it.quantity) || 1)),
          ),
        })),
      });
      toast.success(`Zgłoszenie zwrotu ${created.rmz_number || `#${created.id}`} zostało wysłane.`);
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (e: unknown) {
      let msg = "Nie udało się wysłać formularza zwrotu.";
      if (axios.isAxiosError(e) && e.response?.data != null) {
        msg = formatFastApiErrorDetail(e.response.data);
      }
      setErr(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">Ładowanie formularza…</div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-red-600">{err || "Nie znaleziono zamówienia."}</p>
        <Link to="/orders/list" className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:underline">
          Wróć do listy
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Formularz klienta</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Zwrot zamówienia #{order.number ?? order.id}</h1>
        <p className="mt-2 text-[13px] text-slate-600">
          Zaznacz produkty, które chcesz zwrócić, i wyślij zgłoszenie. To uproszczony formularz — nie jest to panel
          magazynowy.
        </p>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Dane</h2>
          <p className="mt-1 text-sm font-semibold text-slate-900">{customerName}</p>
          <div className="mt-1 space-y-0.5 text-[13px] text-slate-600">
            {addressLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </section>

        <section className="mt-4 space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Produkty</h2>
          {eligible.map((it) => {
            const pick = lines[it.id];
            const maxQty = Math.max(1, Math.floor(Number(it.quantity) || 1));
            if (!pick) return null;
            return (
              <div
                key={it.id}
                className={`rounded-xl border bg-white p-3 transition-colors ${
                  pick.selected ? "border-emerald-200" : "border-slate-200"
                }`}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={pick.selected}
                    onChange={(e) =>
                      setLines((prev) => ({
                        ...prev,
                        [it.id]: { ...pick, selected: e.target.checked },
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-slate-900">
                      {(it.product?.name || "Produkt").trim()}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">
                      {it.product?.sku ? `SKU ${it.product.sku}` : "SKU —"} · Zakupiono {maxQty} szt.
                    </span>
                  </span>
                </label>
                {pick.selected ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Ilość</span>
                      <input
                        type="number"
                        min={1}
                        max={maxQty}
                        value={pick.qty}
                        onChange={(e) => {
                          const n = Math.floor(Number(e.target.value) || 1);
                          setLines((prev) => ({
                            ...prev,
                            [it.id]: { ...pick, qty: Math.min(maxQty, Math.max(1, n)) },
                          }));
                        }}
                        className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Powód</span>
                      <select
                        value={pick.reasonId}
                        onChange={(e) =>
                          setLines((prev) => ({
                            ...prev,
                            [it.id]: { ...pick, reasonId: e.target.value },
                          }))
                        }
                        className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
                      >
                        {ORDER_CASE_RETURN_REASONS.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Komentarz</span>
                      <input
                        value={pick.comment}
                        onChange={(e) =>
                          setLines((prev) => ({
                            ...prev,
                            [it.id]: { ...pick, comment: e.target.value },
                          }))
                        }
                        placeholder="Opcjonalnie…"
                        className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>

        {err ? <p className="mt-4 text-sm font-medium text-red-700">{err}</p> : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <PrimaryButton type="button" disabled={submitting || selectedCount === 0} onClick={() => void submit()}>
            {submitting ? "Wysyłanie…" : "Wyślij zgłoszenie zwrotu"}
          </PrimaryButton>
          <Link
            to={`/orders/${order.id}`}
            className="inline-flex h-[34px] items-center rounded-lg px-3 text-[13px] font-medium text-slate-600 hover:bg-white"
          >
            Anuluj
          </Link>
        </div>
      </div>
    </div>
  );
}
