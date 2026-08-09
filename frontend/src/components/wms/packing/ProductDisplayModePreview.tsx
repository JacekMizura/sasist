import type { WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import type { PackingProductDisplayMode } from "../../../types/wmsPackingExtendedUi";
import { DefaultCard } from "./DefaultCard";
import { DoneCard } from "./DoneCard";
import {
  DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY,
  type PackingProductFieldVisibility,
} from "./packingProductDisplay";
import {
  packingProductCardItemClass,
  packingProductCardItemStyle,
  packingProductCardsContainerClass,
  packingProductCardsContainerStyle,
} from "./packingProductCardLayout";
import { PackingSettingsPreviewCollapse } from "./settingsPreviews/PackingSettingsPreviewCollapse";

const PREVIEW_IMG =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#fff"/><circle cx="48" cy="40" r="16" fill="#cbd5e1"/><rect x="24" y="60" width="48" height="14" rx="2" fill="#94a3b8"/></svg>',
  );

function previewLine(
  id: number,
  opts: { name: string; qty: number; packed?: number; color?: string; sku?: string; catalog?: string },
): WmsPackingOrderLineApi {
  return {
    order_item_id: id,
    quantity: opts.qty,
    quantity_required: opts.qty,
    quantity_packed: opts.packed ?? 0,
    product_name: opts.name,
    ean: "5901234567890",
    sku: opts.sku ?? `SKU-${id}`,
    product_symbol: opts.sku ?? `SKU-${id}`,
    catalog_number: opts.catalog ?? `CAT-${id}`,
    image_url: PREVIEW_IMG,
    color_name: opts.color ?? "zielony",
    stock_quantity: 42,
    location_label: "R1-2-B",
    location_bin_qty: 10,
    bundle_name: "Zestaw startowy",
    product_signature: `PRD-000${id}`,
    unit_price_display: "4,49 PLN",
  };
}

const PREVIEW_LINES: WmsPackingOrderLineApi[] = [
  previewLine(1, {
    name: "Bawełniany T-shirt męski ETHAN",
    qty: 1,
    color: "zielony",
    sku: "ETHAN-GRN",
    catalog: "T-1001",
  }),
  previewLine(2, {
    name: "Walizka podróżna M",
    qty: 1,
    packed: 0,
    color: "czarny",
    sku: "CASE-M",
    catalog: "W-220",
  }),
  previewLine(3, {
    name: "Skarpety sport",
    qty: 4,
    color: "czarny",
    sku: "SOCK-BLK",
    catalog: "S-220",
  }),
];

const noop = () => undefined;

/** Podgląd ustawień: pokaż więcej pól niż domyślnie (jak na mockupu). */
const PREVIEW_FIELD_OVERRIDES: Partial<PackingProductFieldVisibility> = {
  show_signature: true,
  show_price: true,
};

type Props = {
  mode: PackingProductDisplayMode;
  fieldVisibility?: PackingProductFieldVisibility;
};

/**
 * Podgląd Lista / Siatka — te same karty co w pakowaniu, zwijany, stałe wymiary.
 */
export function ProductDisplayModePreview({
  mode,
  fieldVisibility = DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY,
}: Props) {
  const label = mode === "grid" ? "Siatka" : "Lista";
  const itemStyle = packingProductCardItemStyle(mode, { allowShrink: false });
  const visibility: PackingProductFieldVisibility = {
    ...fieldVisibility,
    ...PREVIEW_FIELD_OVERRIDES,
    show_product_name: true,
    show_image: fieldVisibility.show_image,
    show_location: fieldVisibility.show_location,
  };

  return (
    <PackingSettingsPreviewCollapse>
      <p className="mb-2 text-sm font-bold text-slate-900">{label}</p>
      <div className="overflow-x-auto overflow-y-hidden rounded-md border border-slate-100 bg-white p-2">
        <ul
          className={packingProductCardsContainerClass()}
          style={{
            ...packingProductCardsContainerStyle(),
            width: "100%",
            minWidth: 0,
          }}
        >
          {PREVIEW_LINES.map((line) => {
            const done =
              line.quantity_packed >=
              (typeof line.quantity_required === "number" ? line.quantity_required : line.quantity);
            return (
              <li key={line.order_item_id} className={packingProductCardItemClass()} style={itemStyle}>
                {done ? (
                  <DoneCard line={line} flash={false} fieldVisibility={visibility} displayMode={mode} />
                ) : (
                  <DefaultCard
                    line={line}
                    scanBusy={false}
                    fieldVisibility={visibility}
                    displayMode={mode}
                    lockCardSize
                    onActivate={noop}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </PackingSettingsPreviewCollapse>
  );
}
