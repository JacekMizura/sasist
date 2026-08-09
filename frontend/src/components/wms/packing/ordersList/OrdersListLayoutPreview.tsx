import type { WmsPackingOrderCardApi, WmsPackingOrderLineApi } from "../../../../api/wmsPackingApi";
import {
  packingOrdersListLayoutLabel,
  type PackingOrdersListLayout,
} from "../../../../types/wmsPackingExtendedUi";
import { ExpandedHorizontalOrderCard } from "./ExpandedHorizontalOrderCard";
import { ExpandedVerticalOrderCard } from "./ExpandedVerticalOrderCard";
import { StandardOrderCard } from "./StandardOrderCard";

function previewLine(
  id: number,
  opts: {
    name: string;
    qty: number;
    packed?: number;
    ean?: string;
    color?: string;
    missing?: number;
  },
): WmsPackingOrderLineApi {
  return {
    order_item_id: id,
    quantity: opts.qty,
    quantity_required: opts.qty,
    quantity_packed: opts.packed ?? 0,
    missing_quantity: opts.missing,
    product_name: opts.name,
    ean: opts.ean ?? "5901234567890",
    sku: null,
    image_url: null,
    color_name: opts.color ?? null,
  };
}

function previewOrder(
  id: number,
  number: string,
  opts: {
    packed: number;
    total: number;
    method: string;
    logo?: string | null;
    prefix?: string;
    completed?: boolean;
    lines: WmsPackingOrderLineApi[];
  },
): WmsPackingOrderCardApi {
  return {
    order_id: id,
    number,
    packed_quantity: opts.packed,
    total_quantity: opts.total,
    is_completed: opts.completed,
    order_ui_status: null,
    shipping_method: opts.method,
    shipping_method_logo_url: opts.logo ?? "/assets/carriers/dpd.svg",
    document_prefix: opts.prefix ?? "Fa",
    lines: opts.lines,
  };
}

const PREVIEW_ORDERS: WmsPackingOrderCardApi[] = [
  previewOrder(1, "2158", {
    packed: 1,
    total: 5,
    method: "DPD",
    lines: [
      previewLine(11, { name: "Bawełniany T-shirt ETHAN", qty: 1, packed: 1, color: "zielony" }),
      previewLine(12, { name: "Skarpety sport", qty: 4, color: "czarny", missing: 1 }),
    ],
  }),
  previewOrder(2, "2160", {
    packed: 0,
    total: 2,
    method: "UPS",
    logo: null,
    lines: [
      previewLine(21, { name: "Torba shopper", qty: 1, color: "beżowy" }),
      previewLine(22, { name: "Portfel męski", qty: 1, color: "czarny" }),
    ],
  }),
  previewOrder(3, "2162", {
    packed: 2,
    total: 2,
    method: "DPD",
    completed: true,
    lines: [
      previewLine(31, { name: "Plecak miejski", qty: 1, packed: 1, color: "granat" }),
      previewLine(32, { name: "Bidon 0.7l", qty: 1, packed: 1, color: "zielony" }),
    ],
  }),
];

const noop = () => undefined;

type Props = {
  layout: PackingOrdersListLayout;
};

/**
 * Dynamiczny, kompaktowy podgląd — renderuje te same karty co lista pakowania (skalowane).
 */
export function OrdersListLayoutPreview({ layout }: Props) {
  const label = packingOrdersListLayoutLabel(layout);

  return (
    <div className="mt-2 max-w-xl rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-1 text-xs font-semibold text-slate-600">Podgląd układu</p>
      <p className="mb-2 text-sm font-bold text-slate-900">{label}</p>
      <div className="overflow-hidden rounded-md border border-slate-100 bg-white p-2">
        {layout === "compact" ? <StandardPreview /> : null}
        {layout === "cards" ? <HorizontalPreview /> : null}
        {layout === "expanded_vertical" ? <VerticalPreview /> : null}
      </div>
    </div>
  );
}

function StandardPreview() {
  return (
    <div className="origin-top-left scale-[0.72]" style={{ width: "138.9%" }}>
      <div className="flex flex-wrap gap-2">
        {PREVIEW_ORDERS.map((o) => (
          <StandardOrderCard key={o.order_id} order={o} onOpenOrder={noop} />
        ))}
      </div>
    </div>
  );
}

function HorizontalPreview() {
  return (
    <div className="origin-top-left scale-[0.62]" style={{ width: "161.3%" }}>
      <div className="flex gap-3 overflow-hidden pb-1">
        {PREVIEW_ORDERS.map((o) => (
          <ExpandedHorizontalOrderCard
            key={o.order_id}
            order={o}
            onOpenOrder={noop}
            maxVisibleLines={2}
          />
        ))}
      </div>
    </div>
  );
}

function VerticalPreview() {
  return (
    <div className="origin-top-left scale-[0.68]" style={{ width: "147%" }}>
      <div className="flex max-w-lg flex-col gap-2">
        {PREVIEW_ORDERS.slice(0, 2).map((o) => (
          <ExpandedVerticalOrderCard key={o.order_id} order={o} onOpenOrder={noop} />
        ))}
      </div>
    </div>
  );
}
