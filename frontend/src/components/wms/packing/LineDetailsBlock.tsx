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
  /** `columns` = Lista (2 kolumny jak Figma); `stack` = Kafelki (jedna kolumna). */
  layout?: "columns" | "stack";
};

type MetaRow = { key: string; node: ReactNode };

/** Wspólny blok metadanych produktu — tylko prezentacja wg ustawień widoczności. */
export function LineDetailsBlock({ line, variant, fieldVisibility, layout = "columns" }: Props) {
  const vis = fieldVisibility ?? DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY;
  const stock = line.stock_quantity;
  const color = (line.color_name ?? "").trim();
  const ean = (line.ean ?? "").trim() || "—";
  const nrKat = (line.catalog_number ?? "").trim() || "—";
  const sym = (line.product_symbol ?? line.sku ?? "").trim() || "—";
  const signature = (line.product_signature ?? "").trim() || "—";
  const price = (line.unit_price_display ?? "").trim() || "—";
  const bundle = (line.bundle_name ?? "").trim();

  const muted = variant === "done";
  const labelCls = muted ? "text-emerald-800/70" : "text-slate-500";
  const textCls = muted ? "text-slate-700" : "text-slate-700";
  const stanCls = muted ? "text-slate-800" : "text-slate-900";

  const byKey = new Map<string, MetaRow>();

  if (color) {
    byKey.set("color", {
      key: "color",
      node: (
        <p className={textCls}>
          <span className={labelCls}>Kolor:</span> {color}
        </p>
      ),
    });
  }
  if (vis.show_stock) {
    byKey.set("stock", {
      key: "stock",
      node: (
        <p className={textCls}>
          <span className={labelCls}>Stan:</span>{" "}
          <span className={["font-semibold tabular-nums", stanCls].join(" ")}>{stock != null ? stock : "—"}</span>
        </p>
      ),
    });
  }
  if (vis.show_ean) {
    byKey.set("ean", {
      key: "ean",
      node: (
        <p className={textCls}>
          <span className={labelCls}>Ean:</span> <span className="font-mono text-[12px]">{ean}</span>
        </p>
      ),
    });
  }
  if (vis.show_symbol) {
    byKey.set("sym", {
      key: "sym",
      node: (
        <p className={textCls}>
          <span className={labelCls}>Symbol:</span> {sym}
        </p>
      ),
    });
  }
  if (vis.show_catalog_number) {
    byKey.set("cat", {
      key: "cat",
      node: (
        <p className={textCls}>
          <span className={labelCls}>Nr kat:</span> {nrKat}
        </p>
      ),
    });
  }
  if (vis.show_signature) {
    byKey.set("sig", {
      key: "sig",
      node: (
        <p className={textCls}>
          <span className={labelCls}>Sygnatura:</span> {signature}
        </p>
      ),
    });
  }
  if (vis.show_price) {
    byKey.set("price", {
      key: "price",
      node: (
        <p className={textCls}>
          <span className={labelCls}>Cena:</span>{" "}
          <span className="font-semibold tabular-nums">{price}</span>
        </p>
      ),
    });
  }
  if (vis.show_bundle_info && bundle) {
    byKey.set("bundle", {
      key: "bundle",
      node: (
        <p className={textCls}>
          <span className={labelCls}>Z zestawu:</span> {bundle}
        </p>
      ),
    });
  }

  if (byKey.size === 0) return null;

  if (layout === "stack") {
    const order = ["color", "stock", "ean", "sym", "cat", "sig", "price", "bundle"];
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
    <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-0.5 text-[12px] leading-snug">
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
