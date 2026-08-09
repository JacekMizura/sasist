import type { WmsPackingOrderCardApi, WmsPackingOrderLineApi } from "../../../../api/wmsPackingApi";
import {
  packingOrdersListLayoutLabel,
  type PackingOrdersListLayout,
} from "../../../../types/wmsPackingExtendedUi";
import { ExpandedHorizontalOrderCard } from "./ExpandedHorizontalOrderCard";
import { ExpandedVerticalOrderCard } from "./ExpandedVerticalOrderCard";
import {
  DEFAULT_ORDERS_LIST_PRODUCT_FIELDS,
  type OrdersListProductFieldVisibility,
} from "./ordersListProductFields";
import { StandardOrderCard } from "./StandardOrderCard";

function previewLine(
  id: number,
  opts: {
    name: string;
    qty: number;
    packed?: number;
    ean?: string;
    sku?: string;
    catalog?: string;
    color?: string;
    missing?: number;
    image?: string | null;
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
    sku: opts.sku ?? `SKU-${id}`,
    product_symbol: opts.sku ?? `SKU-${id}`,
    catalog_number: opts.catalog ?? `CAT-${id}`,
    image_url: opts.image ?? null,
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

/** Prosty SVG — tylko by pokazać slot zdjęcia w podglądzie (bez szarego placeholdera w layoutcie). */
const PREVIEW_IMG =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#fff"/><circle cx="32" cy="28" r="12" fill="#cbd5e1"/><rect x="16" y="42" width="32" height="10" rx="2" fill="#94a3b8"/></svg>',
  );

const PREVIEW_ORDERS: WmsPackingOrderCardApi[] = [
  previewOrder(1, "2158", {
    packed: 1,
    total: 5,
    method: "DPD",
    lines: [
      previewLine(11, {
        name: "Bawełniany T-shirt ETHAN",
        qty: 1,
        packed: 1,
        color: "zielony",
        sku: "ETHAN-GRN",
        catalog: "T-1001",
        image: PREVIEW_IMG,
      }),
      previewLine(12, {
        name: "Skarpety sport",
        qty: 4,
        color: "czarny",
        missing: 1,
        sku: "SOCK-BLK",
        catalog: "S-220",
        image: PREVIEW_IMG,
      }),
    ],
  }),
  previewOrder(2, "2160", {
    packed: 0,
    total: 2,
    method: "UPS",
    logo: null,
    lines: [
      previewLine(21, {
        name: "Torba shopper",
        qty: 1,
        color: "beżowy",
        sku: "BAG-01",
        catalog: "B-55",
        image: PREVIEW_IMG,
      }),
      previewLine(22, {
        name: "Portfel męski",
        qty: 1,
        color: "czarny",
        sku: "WAL-M",
        catalog: "W-12",
        image: PREVIEW_IMG,
      }),
    ],
  }),
  previewOrder(3, "2162", {
    packed: 2,
    total: 2,
    method: "DPD",
    completed: true,
    lines: [
      previewLine(31, {
        name: "Plecak miejski",
        qty: 1,
        packed: 1,
        color: "granat",
        sku: "BP-NAV",
        catalog: "P-90",
        image: PREVIEW_IMG,
      }),
      previewLine(32, {
        name: "Bidon 0.7l",
        qty: 1,
        packed: 1,
        color: "zielony",
        sku: "BOT-07",
        catalog: "D-07",
        image: PREVIEW_IMG,
      }),
    ],
  }),
];

const noop = () => undefined;

type Props = {
  layout: PackingOrdersListLayout;
  productFields?: OrdersListProductFieldVisibility;
};

/**
 * Dynamiczny, kompaktowy podgląd — te same karty i te same ustawienia pól produktu co lista pakowania.
 */
export function OrdersListLayoutPreview({
  layout,
  productFields = DEFAULT_ORDERS_LIST_PRODUCT_FIELDS,
}: Props) {
  const label = packingOrdersListLayoutLabel(layout);
  /** Standardowy nigdy nie pokazuje zdjęć produktów — niezależnie od checkboxa. */
  const fieldsForLayout: OrdersListProductFieldVisibility =
    layout === "compact" ? { ...productFields, showImage: false } : productFields;

  return (
    <div className="mt-2 max-w-xl rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-1 text-xs font-semibold text-slate-600">Podgląd układu</p>
      <p className="mb-2 text-sm font-bold text-slate-900">{label}</p>
      <div className="overflow-hidden rounded-md border border-slate-100 bg-white p-2">
        {layout === "compact" ? <StandardPreview /> : null}
        {layout === "cards" ? <HorizontalPreview productFields={fieldsForLayout} /> : null}
        {layout === "expanded_vertical" ? <VerticalPreview productFields={fieldsForLayout} /> : null}
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

function HorizontalPreview({ productFields }: { productFields: OrdersListProductFieldVisibility }) {
  return (
    <div className="origin-top-left scale-[0.62]" style={{ width: "161.3%" }}>
      <div className="flex gap-3 overflow-hidden pb-1">
        {PREVIEW_ORDERS.map((o) => (
          <ExpandedHorizontalOrderCard
            key={o.order_id}
            order={o}
            onOpenOrder={noop}
            maxVisibleLines={2}
            productFields={productFields}
          />
        ))}
      </div>
    </div>
  );
}

function VerticalPreview({ productFields }: { productFields: OrdersListProductFieldVisibility }) {
  return (
    <div className="origin-top-left scale-[0.68]" style={{ width: "147%" }}>
      <div className="flex max-w-lg flex-col gap-2">
        {PREVIEW_ORDERS.slice(0, 2).map((o) => (
          <ExpandedVerticalOrderCard
            key={o.order_id}
            order={o}
            onOpenOrder={noop}
            productFields={productFields}
          />
        ))}
      </div>
    </div>
  );
}
