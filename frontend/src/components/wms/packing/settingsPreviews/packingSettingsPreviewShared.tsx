import type { WmsPackingOrderLineApi } from "../../../../api/wmsPackingApi";
import type { PackingProductDisplayMode } from "../../../../types/wmsPackingExtendedUi";
import { DefaultCard } from "../DefaultCard";
import { DoneCard } from "../DoneCard";
import {
  DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY,
  type PackingProductFieldVisibility,
} from "../packingProductDisplay";
import {
  packingProductCardItemClass,
  packingProductCardItemStyle,
  packingProductCardsContainerClass,
  packingProductCardsContainerStyle,
} from "../packingProductCardLayout";

const PREVIEW_IMG =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#fff"/><circle cx="48" cy="40" r="16" fill="#cbd5e1"/><rect x="24" y="60" width="48" height="14" rx="2" fill="#94a3b8"/></svg>',
  );

const DOC_GREEN = "#2e7d32";
const PRIMARY_GREEN = "#4caf50";

function previewLine(
  id: number,
  opts: {
    name: string;
    qty: number;
    packed?: number;
    color?: string;
    sku?: string | null;
    catalog?: string | null;
    signature?: string | null;
    price?: string | null;
    bundle?: string | null;
    ean?: string | null;
    location?: string | null;
    locQty?: number | null;
  },
): WmsPackingOrderLineApi {
  return {
    order_item_id: id,
    quantity: opts.qty,
    quantity_required: opts.qty,
    quantity_packed: opts.packed ?? 0,
    product_name: opts.name,
    ean: opts.ean === null ? null : (opts.ean ?? "5901234567890"),
    sku: opts.sku === null ? null : (opts.sku ?? undefined),
    product_symbol: opts.sku === null ? null : (opts.sku ?? undefined),
    catalog_number: opts.catalog === null ? null : (opts.catalog ?? undefined),
    image_url: PREVIEW_IMG,
    color_name: opts.color ?? "zielony",
    stock_quantity: 42,
    location_label: opts.location === null ? null : (opts.location ?? "R1-2-B"),
    location_bin_qty: opts.locQty === null ? null : (opts.locQty ?? 10),
    bundle_name: opts.bundle === null ? null : (opts.bundle ?? "Zestaw startowy"),
    product_signature: opts.signature === null ? null : (opts.signature ?? `PRD-000${id}`),
    unit_price_display: opts.price === null ? null : (opts.price ?? "4,49 PLN"),
  };
}

/** Wspólne dane przykładowe — bez pustych „—” (brakujące pola = null). */
export const PACKING_SETTINGS_PREVIEW_LINES: WmsPackingOrderLineApi[] = [
  previewLine(1, {
    name: "Bawełniany T-shirt męski ETHAN",
    qty: 1,
    color: "zielony",
    sku: "ETHAN-GRN",
    catalog: "T-1001",
    location: "R1-2-B",
    locQty: 10,
  }),
  previewLine(2, {
    name: "Walizka podróżna M",
    qty: 1,
    color: "czarny",
    sku: "CASE-M",
    catalog: null,
    signature: null,
    price: "129,00 PLN",
    bundle: null,
    location: "B6-C-1",
    locQty: 99,
  }),
  previewLine(3, {
    name: "Skarpety sport",
    qty: 1,
    packed: 1,
    color: "czarny",
    sku: null,
    catalog: "S-220",
    signature: "PRD-000203",
    price: null,
    bundle: null,
    location: "A2-1-D",
    locQty: 24,
  }),
];

export const PACKING_SETTINGS_PREVIEW_VISIBILITY: PackingProductFieldVisibility = {
  ...DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY,
  show_signature: true,
  show_price: true,
  show_product_name: true,
  show_image: true,
  show_location: true,
  location_placement: "top_right",
  show_ean: true,
  show_symbol: true,
  show_catalog_number: true,
  show_stock: true,
  show_bundle_info: true,
  truncate_names: false,
};

const noop = () => undefined;

type CardsProps = {
  mode: PackingProductDisplayMode;
  fieldVisibility?: PackingProductFieldVisibility;
  /** Ile kart pokazać (layout preview zwykle 2). */
  limit?: number;
};

/** Te same karty Default/Done co w pakowaniu — stałe wymiary, bez aktywacji. */
export function PackingSettingsPreviewProductCards({
  mode,
  fieldVisibility = PACKING_SETTINGS_PREVIEW_VISIBILITY,
  limit,
}: CardsProps) {
  const itemStyle = packingProductCardItemStyle(mode, { allowShrink: false });
  const lines = limit != null ? PACKING_SETTINGS_PREVIEW_LINES.slice(0, limit) : PACKING_SETTINGS_PREVIEW_LINES;

  return (
    <ul
      className={packingProductCardsContainerClass()}
      style={{
        ...packingProductCardsContainerStyle(),
        width: "100%",
        minWidth: 0,
      }}
    >
      {lines.map((line) => {
        const done =
          line.quantity_packed >=
          (typeof line.quantity_required === "number" ? line.quantity_required : line.quantity);
        return (
          <li key={line.order_item_id} className={packingProductCardItemClass()} style={itemStyle}>
            {done ? (
              <DoneCard line={line} flash={false} fieldVisibility={fieldVisibility} displayMode={mode} />
            ) : (
              <DefaultCard
                line={line}
                scanBusy={false}
                fieldVisibility={fieldVisibility}
                displayMode={mode}
                lockCardSize
                onActivate={noop}
                onMarkShortage={noop}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Wąski sidebar zamówienia — ten sam język wizualny co podgląd dokumentu sprzedaży. */
export function PackingSettingsPreviewOrderSidebar() {
  return (
    <aside
      className="flex w-[9.75rem] shrink-0 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2.5"
      aria-label="Sidebar zamówienia"
    >
      <div className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500">
        ☰
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded px-1 text-[11px] font-bold text-white"
          style={{ background: DOC_GREEN }}
        >
          Fa
        </span>
        <span className="text-[11px] font-bold tabular-nums text-slate-900">FV/0842</span>
      </div>
      <p className="text-[10px] font-semibold text-slate-500">Faktura</p>
      <div className="border-t border-slate-100 pt-2">
        <div className="h-4 w-16 rounded bg-slate-100" />
        <p className="mt-1.5 text-[10px] text-slate-600">
          Wysyłka: <span className="font-semibold text-slate-800">DPD</span>
        </p>
        <p className="mt-1 text-[10px] text-slate-600">
          Płatność: <span className="font-semibold text-slate-800">Przelew</span>
        </p>
      </div>
      <button
        type="button"
        className="mt-auto w-full rounded-md py-1.5 text-[10px] font-bold text-white"
        style={{ background: PRIMARY_GREEN }}
        tabIndex={-1}
      >
        Spakuj wszystko
      </button>
    </aside>
  );
}

/** Górna belka info (układ pełnej szerokości). */
export function PackingSettingsPreviewFullWidthStrip() {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
      <span
        className="inline-flex h-5 min-w-[1.35rem] items-center justify-center rounded px-1 text-[10px] font-bold text-white"
        style={{ background: DOC_GREEN }}
      >
        Fa
      </span>
      <span className="text-[11px] font-bold tabular-nums text-slate-900">FV/2026/0842</span>
      <span className="text-[10px] font-semibold text-slate-500">Faktura</span>
      <span className="text-[10px] text-slate-500">·</span>
      <span className="text-[10px] font-medium text-slate-700">DPD</span>
      <span className="ml-auto rounded-md px-2 py-1 text-[10px] font-bold text-white" style={{ background: PRIMARY_GREEN }}>
        Spakuj wszystko
      </span>
    </div>
  );
}
