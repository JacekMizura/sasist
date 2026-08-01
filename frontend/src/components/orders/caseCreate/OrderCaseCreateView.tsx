import axios from "axios";
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

import { createComplaintFromOrder } from "../../../api/complaintsApi";
import { createWmsReturn } from "../../../api/wmsReturnsApi";
import { formatFastApiErrorDetail } from "../../../api/wmsPickingProductsApi";
import { DAMAGE_TENANT_ID } from "../../../constants/panelTenant";
import type { OrderDetail, OrderItemRow } from "../orderDetailPageTypes";
import { OrderCaseCreateProductList } from "./OrderCaseCreateProductList";
import { OrderCaseCreateSummaryPanel } from "./OrderCaseCreateSummaryPanel";
import {
  orderCaseConditionLabel,
  orderCaseReasonLabel,
} from "./orderCaseCreateConstants";
import type {
  OrderCaseDraftMeta,
  OrderCaseKind,
  OrderCaseLineDraft,
} from "./orderCaseCreateTypes";
import { parseShippingAddressBlock } from "../../../utils/orderDetailAddress";

type Props = {
  kind: OrderCaseKind;
  order: OrderDetail;
  warehouseId: number | null;
  onCancel: () => void;
  onCreated: (kind: OrderCaseKind, id: number) => void;
};

function unitPriceOf(item: OrderItemRow): number {
  const candidates = [
    item.unit_price_gross,
    item.unit_price,
    item.unit_price_net,
    item.list_price,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

function eligibleItems(order: OrderDetail): OrderItemRow[] {
  return (order.items ?? []).filter((it) => {
    if (it.is_bundle_parent) return false;
    if (!it.product?.id) return false;
    const q = Number(it.quantity) || 0;
    return q > 0;
  });
}

/**
 * In-panel create flow for return / complaint — looks like order work, not a WMS jump.
 * Persist via existing APIs; WMS receives the return as a warehouse task automatically.
 */
export function OrderCaseCreateView({ kind, order, warehouseId, onCancel, onCreated }: Props) {
  const [lines, setLines] = useState<OrderCaseLineDraft[]>([]);
  const [meta, setMeta] = useState<OrderCaseDraftMeta>({
    refundShipping: false,
    settlement: "refund",
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalog = useMemo(() => {
    const added = new Set(lines.map((l) => l.orderItemId));
    return eligibleItems(order).map((it) => ({
      orderItemId: it.id,
      productId: Number(it.product!.id),
      name: (it.product?.name || "Produkt").trim() || "Produkt",
      sku: (it.product?.sku || it.product?.symbol || null) as string | null,
      imageUrl: (it.product?.image_url || null) as string | null,
      purchasedQty: Math.max(1, Math.floor(Number(it.quantity) || 1)),
      unitPrice: unitPriceOf(it),
      added: added.has(it.id),
    }));
  }, [order, lines]);

  const shippingCost = Number(order.panel_shipping_cost ?? order.shipping_revenue_net ?? 0) || 0;
  const saleDocumentLabel =
    (order.sales_document_number || "").trim() ||
    (order.panel_document_type || "").trim() ||
    "Brak";
  const statusLabel = "Nowe";
  const title = kind === "return" ? "Nowy zwrot" : "Nowa reklamacja";
  const subtitle =
    kind === "return"
      ? "Dodaj produkty z zamówienia. Realizacja magazynowa odbędzie się później w module WMS."
      : "Dodaj produkty z zamówienia do reklamacji. Kartę otworzysz z Panelu Zamówienia.";
  const customerName =
    (order.customer?.display_name || "").trim() ||
    [order.first_name, order.last_name].filter(Boolean).join(" ").trim() ||
    "—";
  const addressLines = parseShippingAddressBlock(order.addresses_json);

  const onAdd = (orderItemId: number) => {
    const row = catalog.find((c) => c.orderItemId === orderItemId);
    if (!row || row.added) return;
    setLines((prev) => [
      ...prev,
      {
        orderItemId: row.orderItemId,
        productId: row.productId,
        productName: row.name,
        sku: row.sku,
        imageUrl: row.imageUrl,
        purchasedQty: row.purchasedQty,
        unitPrice: row.unitPrice,
        returnQty: row.purchasedQty,
        reasonId: kind === "return" ? "changed_mind" : "transport",
        condition: "new",
        comment: "",
      },
    ]);
  };

  const onRemove = (orderItemId: number) => {
    setLines((prev) => prev.filter((l) => l.orderItemId !== orderItemId));
  };

  const onPatch = (orderItemId: number, patch: Partial<OrderCaseLineDraft>) => {
    setLines((prev) => prev.map((l) => (l.orderItemId === orderItemId ? { ...l, ...patch } : l)));
  };

  const buildNote = (): string => {
    const parts: string[] = [];
    if (meta.note.trim()) parts.push(meta.note.trim());
    parts.push(`Rozliczenie: ${meta.settlement}`);
    if (meta.refundShipping) parts.push("Zwrot kosztu dostawy: tak");
    for (const l of lines) {
      const bits = [
        l.productName,
        `${l.returnQty} szt.`,
        orderCaseReasonLabel(kind, l.reasonId),
        orderCaseConditionLabel(l.condition),
      ];
      if (l.comment.trim()) bits.push(l.comment.trim());
      parts.push(`• ${bits.join(" · ")}`);
    }
    return parts.join("\n");
  };

  const submit = async () => {
    if (lines.length === 0) {
      setError(kind === "return" ? "Dodaj co najmniej jeden produkt do zwrotu." : "Dodaj co najmniej jeden produkt do reklamacji.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (kind === "return") {
        const created = await createWmsReturn({
          tenant_id: order.tenant_id ?? DAMAGE_TENANT_ID,
          warehouse_id: warehouseId ?? undefined,
          order_id: order.id,
          return_type: "RMA",
          lines: lines.map((l) => ({
            order_item_id: l.orderItemId,
            product_id: l.productId,
            quantity: l.returnQty,
          })),
        });
        toast.success(`Utworzono zwrot ${created.rmz_number || `#${created.id}`}`);
        onCreated("return", created.id);
        return;
      }

      const created = await createComplaintFromOrder(
        {
          order_id: order.id,
          note: buildNote(),
          lines: lines.map((l) => ({
            order_item_id: l.orderItemId,
            quantity: l.returnQty,
            defect_ids: [l.reasonId],
          })),
        },
        order.tenant_id ?? DAMAGE_TENANT_ID,
        warehouseId ?? undefined,
      );
      const id = Number(created.id);
      toast.success(`Utworzono reklamację ${created.reference_code || `#${id}`}`);
      onCreated("complaint", id);
    } catch (e: unknown) {
      let msg = kind === "return" ? "Nie udało się utworzyć zwrotu." : "Nie udało się utworzyć reklamacji.";
      if (axios.isAxiosError(e) && e.response?.data != null) {
        msg = formatFastApiErrorDetail(e.response.data);
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <button
          type="button"
          onClick={onCancel}
          className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Wróć do zamówienia
        </button>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 max-w-2xl text-[13px] text-slate-500">{subtitle}</p>
        <p className="mt-1 text-[12px] text-slate-400">Zamówienie #{order.number ?? order.id}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Klient</h3>
          <p className="mt-1 text-[13px] font-semibold text-slate-900">{customerName}</p>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Adres</h3>
          <div className="mt-1 space-y-0.5 text-[13px] text-slate-700">
            {addressLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Produkty zamówienia
          </h3>
          <OrderCaseCreateProductList
            kind={kind}
            lines={lines}
            catalog={catalog}
            onAdd={onAdd}
            onRemove={onRemove}
            onPatch={onPatch}
          />
        </div>
        <OrderCaseCreateSummaryPanel
          kind={kind}
          lines={lines}
          meta={meta}
          shippingCost={shippingCost}
          saleDocumentLabel={saleDocumentLabel}
          statusLabel={statusLabel}
          submitting={submitting}
          error={error}
          onChangeMeta={(patch) => setMeta((prev) => ({ ...prev, ...patch }))}
          onSubmit={() => void submit()}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
