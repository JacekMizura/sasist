import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import api from "../../../api/axios";
import { createWmsReturn } from "../../../api/wmsReturnsApi";
import { formatFastApiErrorDetail } from "../../../api/wmsPickingProductsApi";
import { DAMAGE_TENANT_ID } from "../../../constants/panelTenant";
import type {
  CustomerReturnCatalogRow,
  CustomerReturnLineDraft,
  CustomerReturnMeta,
  CustomerReturnOrderLite,
} from "./customerReturnFormTypes";
import {
  customerReturnEligibleItems,
  customerReturnUnitPrice,
} from "./customerReturnFormUtils";

const EMPTY_META: CustomerReturnMeta = {
  refundShipping: false,
  refundMethod: "store_credit",
  bank: { accountHolder: "", iban: "" },
};

export function useCustomerReturnForm(orderId: number) {
  const navigate = useNavigate();
  const [order, setOrder] = useState<CustomerReturnOrderLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<CustomerReturnLineDraft[]>([]);
  const [meta, setMeta] = useState<CustomerReturnMeta>(EMPTY_META);
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
      .get<CustomerReturnOrderLite>(`/orders/${orderId}`)
      .then((res) => {
        if (cancelled) return;
        setOrder(res.data);
        setLines([]);
        setMeta(EMPTY_META);
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

  const catalog: CustomerReturnCatalogRow[] = useMemo(() => {
    if (!order) return [];
    const added = new Set(lines.map((l) => l.orderItemId));
    return customerReturnEligibleItems(order).map((it) => ({
      orderItemId: it.id,
      productId: Number(it.product!.id),
      name: (it.product?.name || "Produkt").trim() || "Produkt",
      sku: (it.product?.sku || it.product?.symbol || null) as string | null,
      ean: (it.product?.ean || null) as string | null,
      imageUrl: (it.product?.image_url || null) as string | null,
      purchasedQty: Math.max(1, Math.floor(Number(it.quantity) || 1)),
      unitPrice: customerReturnUnitPrice(it),
      added: added.has(it.id),
    }));
  }, [order, lines]);

  const shippingCost = Number(order?.panel_shipping_cost ?? order?.shipping_revenue_net ?? 0) || 0;
  const saleDocumentLabel =
    (order?.sales_document_number || "").trim() ||
    (order?.panel_document_type || "").trim() ||
    "Brak";

  const onAdd = useCallback(
    (orderItemId: number) => {
      const row = catalog.find((c) => c.orderItemId === orderItemId);
      if (!row || row.added) return;
      setLines((prev) => [
        ...prev,
        {
          orderItemId: row.orderItemId,
          productId: row.productId,
          productName: row.name,
          sku: row.sku,
          ean: row.ean,
          imageUrl: row.imageUrl,
          purchasedQty: row.purchasedQty,
          unitPrice: row.unitPrice,
          returnQty: row.purchasedQty,
          reasonId: "changed_mind",
          condition: "new",
          comment: "",
          photoFiles: [],
        },
      ]);
    },
    [catalog],
  );

  const onRemove = useCallback((orderItemId: number) => {
    setLines((prev) => prev.filter((l) => l.orderItemId !== orderItemId));
  }, []);

  const onPatch = useCallback((orderItemId: number, patch: Partial<CustomerReturnLineDraft>) => {
    setLines((prev) => prev.map((l) => (l.orderItemId === orderItemId ? { ...l, ...patch } : l)));
  }, []);

  const onChangeMeta = useCallback((patch: Partial<CustomerReturnMeta>) => {
    setMeta((prev) => ({
      ...prev,
      ...patch,
      bank: patch.bank ? { ...prev.bank, ...patch.bank } : prev.bank,
    }));
  }, []);

  const submit = useCallback(async () => {
    if (!order) return;
    if (lines.length === 0) {
      setErr("Dodaj co najmniej jeden produkt do zwrotu.");
      return;
    }
    if (meta.refundMethod === "bank_transfer") {
      if (!meta.bank.accountHolder.trim() || !meta.bank.iban.trim()) {
        setErr("Podaj dane konta bankowego do przelewu.");
        return;
      }
    }
    setSubmitting(true);
    setErr(null);
    try {
      const created = await createWmsReturn({
        tenant_id: order.tenant_id ?? DAMAGE_TENANT_ID,
        warehouse_id: order.warehouse_id ?? undefined,
        order_id: order.id,
        return_type: "RMA",
        lines: lines.map((l) => ({
          order_item_id: l.orderItemId,
          product_id: l.productId,
          quantity: Math.min(Math.max(1, l.returnQty), l.purchasedQty),
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
  }, [order, lines, meta, navigate]);

  return {
    order,
    loading,
    catalog,
    lines,
    meta,
    shippingCost,
    saleDocumentLabel,
    submitting,
    err,
    onAdd,
    onRemove,
    onPatch,
    onChangeMeta,
    submit,
  };
}
