import type { WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import type { PackingProductDisplayMode } from "../../../types/wmsPackingExtendedUi";
import { DefaultCard } from "./DefaultCard";
import {
  DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY,
  type PackingProductFieldVisibility,
} from "./packingProductDisplay";

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
];

const noop = () => undefined;

type Props = {
  mode: PackingProductDisplayMode;
  fieldVisibility?: PackingProductFieldVisibility;
};

/** Podgląd Lista / Siatka — te same karty co w widoku pakowania. */
export function ProductDisplayModePreview({
  mode,
  fieldVisibility = DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY,
}: Props) {
  const label = mode === "grid" ? "Siatka" : "Lista";
  const gridClass =
    mode === "grid"
      ? "grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr))]"
      : "grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))]";

  return (
    <div className="mt-2 max-w-xl rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-1 text-xs font-semibold text-slate-600">Podgląd układu</p>
      <p className="mb-2 text-sm font-bold text-slate-900">{label}</p>
      <div className="overflow-hidden rounded-md border border-slate-100 bg-white p-2">
        <div className="origin-top-left scale-[0.78]" style={{ width: "128.2%" }}>
          <ul className={["m-0 list-none p-0", gridClass].join(" ")}>
            {PREVIEW_LINES.map((line) => (
              <li key={line.order_item_id} className="min-w-0">
                <DefaultCard
                  line={line}
                  scanBusy={false}
                  fieldVisibility={fieldVisibility}
                  displayMode={mode}
                  onActivate={noop}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
