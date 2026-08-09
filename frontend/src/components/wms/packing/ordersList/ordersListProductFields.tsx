import type { WmsPackingOrderLineApi } from "../../../../api/wmsPackingApi";

/** Widoczność pól produktu w kafelkach listy zamówień (pakowanie). */
export type OrdersListProductFieldVisibility = {
  showImage: boolean;
  showSku: boolean;
  showEan: boolean;
  showCatalogNumber: boolean;
};

export const DEFAULT_ORDERS_LIST_PRODUCT_FIELDS: OrdersListProductFieldVisibility = {
  showImage: true,
  showSku: true,
  showEan: true,
  showCatalogNumber: false,
};

export function ordersListProductFieldsEqual(
  a: OrdersListProductFieldVisibility | undefined,
  b: OrdersListProductFieldVisibility | undefined,
): boolean {
  const x = a ?? DEFAULT_ORDERS_LIST_PRODUCT_FIELDS;
  const y = b ?? DEFAULT_ORDERS_LIST_PRODUCT_FIELDS;
  return (
    x.showImage === y.showImage &&
    x.showSku === y.showSku &&
    x.showEan === y.showEan &&
    x.showCatalogNumber === y.showCatalogNumber
  );
}

export function OrdersListProductThumb({
  line,
  size,
  show,
}: {
  line: WmsPackingOrderLineApi;
  size: number;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden"
      style={{ width: size, height: size }}
    >
      {line.image_url ? (
        <img src={line.image_url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
      ) : (
        <span className="text-xs text-slate-300">—</span>
      )}
    </div>
  );
}

/** Meta wiersze: Symbol / EAN / Nr kat — tylko włączone (bez pustych slotów po wyłączeniu). */
export function OrdersListProductMeta({
  line,
  fields,
  className = "mt-0.5 text-[11px] leading-snug text-slate-500",
}: {
  line: WmsPackingOrderLineApi;
  fields: OrdersListProductFieldVisibility;
  className?: string;
}) {
  const sym = (line.product_symbol ?? line.sku ?? "").trim() || "—";
  const ean = (line.ean ?? "").trim() || "—";
  const nrKat = (line.catalog_number ?? "").trim() || "—";

  if (!fields.showSku && !fields.showEan && !fields.showCatalogNumber) return null;

  return (
    <>
      {fields.showSku ? <p className={className}>Symbol: {sym}</p> : null}
      {fields.showEan ? <p className={className}>EAN: {ean}</p> : null}
      {fields.showCatalogNumber ? <p className={className}>Nr kat: {nrKat}</p> : null}
    </>
  );
}
