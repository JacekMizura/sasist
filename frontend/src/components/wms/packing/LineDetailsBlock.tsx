import type { WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import type { WmsPackingInterfaceDisplay } from "../../../types/wmsPackingSettings";
import { DEFAULT_WMS_PACKING_INTERFACE_DISPLAY } from "../../../types/wmsPackingSettings";

type Props = {
  line: WmsPackingOrderLineApi;
  variant: "default" | "active" | "done";
  /** Z ustawień WMS → Pakowanie; domyślnie wszystkie pola widoczne. */
  fieldVisibility?: WmsPackingInterfaceDisplay;
};

/** Wspólny blok metadanych (Kolor, Stan, EAN…) — tylko prezentacja, bez logiki stanu karty. */
export function LineDetailsBlock({ line, variant, fieldVisibility }: Props) {
  const vis = fieldVisibility ?? DEFAULT_WMS_PACKING_INTERFACE_DISPLAY;
  const stock = line.stock_quantity;
  const color = (line.color_name ?? "").trim();
  const ean = (line.ean ?? "").trim() || "—";
  const nrKat = (line.catalog_number ?? "").trim() || "—";
  const sym = (line.product_symbol ?? line.sku ?? "").trim() || "—";
  const bundle = (line.bundle_name ?? "").trim();

  const muted = variant === "done";
  const labelCls = muted ? "text-slate-400" : "text-slate-500";
  const textCls = muted ? "text-slate-500" : "text-slate-700";
  const stanCls = muted ? "text-slate-500" : "text-slate-900";
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] leading-snug">
      {color ? (
        <p className={textCls}>
          <span className={labelCls}>Kolor:</span> {color}
        </p>
      ) : null}
      {vis.show_stock ? (
        <p className={textCls}>
          <span className={labelCls}>Stan:</span>{" "}
          <span className={["font-semibold tabular-nums", stanCls].join(" ")}>{stock != null ? stock : "—"}</span>
        </p>
      ) : null}
      {vis.show_ean ? (
        <p className={textCls}>
          <span className={labelCls}>Ean:</span> <span className="font-mono text-[12px]">{ean}</span>
        </p>
      ) : null}
      {vis.show_symbol ? (
        <p className={textCls}>
          <span className={labelCls}>Symbol:</span> {sym}
        </p>
      ) : null}
      {vis.show_catalog_number ? (
        <p className={textCls}>
          <span className={labelCls}>Nr kat:</span> {nrKat}
        </p>
      ) : null}
      {bundle ? (
        <p className={["col-span-2", textCls].join(" ")}>
          <span className={labelCls}>Z zestawu:</span> {bundle}
        </p>
      ) : null}
    </div>
  );
}
