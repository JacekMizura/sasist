import type { ReactNode } from "react";
import type { WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import {
  DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY,
  type PackingProductFieldVisibility,
} from "./packingProductDisplay";

type Props = {
  line: WmsPackingOrderLineApi;
  variant: "default" | "active" | "done";
  fieldVisibility?: PackingProductFieldVisibility;
  /** `columns` = Lista / ciało siatki (2 kolumny); `stack` = jedna kolumna. */
  layout?: "columns" | "stack";
};

type MetaRow = { key: string; node: ReactNode };

function EanBadge({ value, muted }: { value: string; muted?: boolean }) {
  return (
    <span
      className={[
        "inline-flex max-w-full items-center truncate rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none",
        // Done cards: keep high-contrast on green wash (avoid pale emerald-on-emerald).
        muted
          ? "border-slate-300/90 bg-white text-slate-900"
          : "border-transparent bg-[#eef0fb] text-[#2f3a7a]",
      ].join(" ")}
      title={value}
    >
      {value}
    </span>
  );
}

function hasText(value: string | null | undefined): value is string {
  return Boolean((value ?? "").trim());
}

/** Wspólny blok metadanych produktu — brak wartości = brak całego pola (bez „—”). */
export function LineDetailsBlock({ line, variant, fieldVisibility, layout = "columns" }: Props) {
  const vis = fieldVisibility ?? DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY;
  const stock = line.stock_quantity;
  const color = (line.color_name ?? "").trim();
  const ean = (line.ean ?? "").trim();
  const nrKat = (line.catalog_number ?? "").trim();
  const sym = (line.product_symbol ?? line.sku ?? "").trim();
  const signature = (line.product_signature ?? "").trim();
  const price = (line.unit_price_display ?? "").trim();
  const bundle = (line.bundle_name ?? "").trim();

  const muted = variant === "done";
  const labelCls = muted ? "text-slate-500/80" : "text-slate-500";
  const textCls = muted ? "text-slate-600/85" : "text-slate-700";
  const stanCls = muted ? "text-slate-700/85" : "text-slate-900";

  const byKey = new Map<string, MetaRow>();

  if (color) {
    byKey.set("color", {
      key: "color",
      node: (
        <p className={["truncate", textCls].join(" ")}>
          <span className={labelCls}>Kolor:</span> {color}
        </p>
      ),
    });
  }
  if (vis.show_stock && stock != null) {
    byKey.set("stock", {
      key: "stock",
      node: (
        <p className={["truncate", textCls].join(" ")}>
          <span className={labelCls}>Stan:</span>{" "}
          <span className={["font-semibold tabular-nums", stanCls].join(" ")}>{stock}</span>
        </p>
      ),
    });
  }
  if (vis.show_ean && hasText(ean)) {
    byKey.set("ean", {
      key: "ean",
      node: (
        <p className={["flex min-w-0 items-center gap-1.5", textCls].join(" ")}>
          <span className={["shrink-0", labelCls].join(" ")}>EAN:</span>
          <EanBadge value={ean} muted={muted} />
        </p>
      ),
    });
  }
  if (vis.show_symbol && hasText(sym)) {
    byKey.set("sym", {
      key: "sym",
      node: (
        <p className={["truncate", textCls].join(" ")}>
          <span className={labelCls}>Symbol:</span> {sym}
        </p>
      ),
    });
  }
  if (vis.show_catalog_number && hasText(nrKat)) {
    byKey.set("cat", {
      key: "cat",
      node: (
        <p className={["truncate", textCls].join(" ")}>
          <span className={labelCls}>Nr kat.:</span> {nrKat}
        </p>
      ),
    });
  }
  if (vis.show_signature && hasText(signature)) {
    byKey.set("sig", {
      key: "sig",
      node: (
        <p className={["truncate", textCls].join(" ")}>
          <span className={labelCls}>Sygnatura:</span> {signature}
        </p>
      ),
    });
  }
  if (vis.show_price && hasText(price)) {
    byKey.set("price", {
      key: "price",
      node: (
        <p className={["truncate", textCls].join(" ")}>
          <span className={labelCls}>Cena:</span>{" "}
          <span className="font-semibold tabular-nums">{price}</span>
        </p>
      ),
    });
  }
  if (vis.show_bundle_info && hasText(bundle)) {
    byKey.set("bundle", {
      key: "bundle",
      node: (
        <p className={["truncate", textCls].join(" ")}>
          <span className={labelCls}>Z zestawu:</span> {bundle}
        </p>
      ),
    });
  }

  if (byKey.size === 0) return null;

  if (layout === "stack") {
    const order = ["color", "ean", "sym", "stock", "cat", "sig", "price", "bundle"];
    return (
      <div className="mt-1.5 space-y-0.5 text-[12px] leading-snug">
        {order.map((k) => {
          const row = byKey.get(k);
          return row ? <div key={row.key}>{row.node}</div> : null;
        })}
      </div>
    );
  }

  const leftOrder = ["color", "ean", "cat", "sig"];
  const rightOrder = ["stock", "sym", "price", "bundle"];

  return (
    <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12px] leading-snug">
      <div className="min-w-0 space-y-0.5">
        {leftOrder.map((k) => {
          const row = byKey.get(k);
          return row ? <div key={row.key}>{row.node}</div> : null;
        })}
      </div>
      <div className="min-w-0 space-y-0.5">
        {rightOrder.map((k) => {
          const row = byKey.get(k);
          return row ? <div key={row.key}>{row.node}</div> : null;
        })}
      </div>
    </div>
  );
}
