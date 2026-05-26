import api from "./axios";

export type ReplenishmentSummary = {
  total_rows: number;
  total_suggested_value: number;
  critical_count: number;
  suggested_count: number;
};

export type ReplenishmentRow = {
  product_id: number;
  image_url?: string | null;
  product_name: string;
  sku?: string | null;
  ean?: string | null;
  category_name?: string | null;
  supplier_id?: number | null;
  supplier_name?: string | null;
  current_stock: number;
  incoming_qty: number;
  sales_30d: number;
  avg_daily_sales: number;
  stock_cover_days?: number | null;
  min_stock?: number | null;
  suggested_qty: number;
  buy_price?: number | null;
  landed_cost_net?: number | null;
  extra_cost_net?: number | null;
  sell_price?: number | null;
  margin_value?: number | null;
  margin_percent?: number | null;
  estimated_order_value: number;
  critical_flag: boolean;
  low_stock_flag: boolean;
  /** Jednostka produktu (szt. → wyświetlanie całkowite w górę, kg/m/l → 2 miejsca). */
  product_unit?: string | null;
};

export type ReplenishmentListPayload = {
  rows: ReplenishmentRow[];
  summary: ReplenishmentSummary;
  page: number;
  page_size: number;
};

export type ReplenishmentQuery = {
  tenant_id: number;
  warehouse_id?: number | null;
  page?: number;
  page_size?: number;
  search?: string;
  supplier_id?: number | null;
  category_id?: number | null;
  critical_only?: boolean;
  low_stock_only?: boolean;
  positive_margin_only?: boolean;
  stock_zero_only?: boolean;
  below_min_stock_only?: boolean;
  has_buy_price_only?: boolean;
  margin_min?: number | null;
  show_loss_products?: boolean;
  low_margin_lt?: number | null;
  top_sales_limit?: number | null;
  /** Klasa ABC wg sprzedaży 30 dni w podmiocie: A, B lub C. */
  segment_abc?: "A" | "B" | "C" | null;
  sort_by?: string;
  sort_dir?: string;
};

function toParams(q: ReplenishmentQuery): Record<string, string | number | boolean | undefined> {
  return {
    tenant_id: q.tenant_id,
    warehouse_id: q.warehouse_id ?? undefined,
    page: q.page,
    page_size: q.page_size,
    search: q.search?.trim() || undefined,
    supplier_id: q.supplier_id ?? undefined,
    category_id: q.category_id ?? undefined,
    critical_only: q.critical_only === true ? true : undefined,
    low_stock_only: q.low_stock_only === true ? true : undefined,
    positive_margin_only: q.positive_margin_only === true ? true : undefined,
    stock_zero_only: q.stock_zero_only === true ? true : undefined,
    below_min_stock_only: q.below_min_stock_only === true ? true : undefined,
    has_buy_price_only: q.has_buy_price_only === true ? true : undefined,
    margin_min:
      q.margin_min != null && Number.isFinite(Number(q.margin_min)) ? Number(q.margin_min) : undefined,
    show_loss_products: q.show_loss_products === true ? true : undefined,
    low_margin_lt:
      q.low_margin_lt != null && Number.isFinite(Number(q.low_margin_lt)) ? Number(q.low_margin_lt) : undefined,
    top_sales_limit:
      q.top_sales_limit != null && Number.isFinite(Number(q.top_sales_limit))
        ? Number(q.top_sales_limit)
        : undefined,
    segment_abc: q.segment_abc ? String(q.segment_abc).trim().toUpperCase() : undefined,
    sort_by: q.sort_by,
    sort_dir: q.sort_dir,
  };
}

export async function fetchPurchasingReplenishment(q: ReplenishmentQuery): Promise<ReplenishmentListPayload> {
  const res = await api.get<ReplenishmentListPayload>("/purchasing/replenishment", { params: toParams(q) });
  return res.data;
}

export type ReplenishmentExportQuery = Omit<ReplenishmentQuery, "page" | "page_size"> & {
  product_ids?: number[];
};

export async function downloadReplenishmentCsv(q: ReplenishmentExportQuery): Promise<void> {
  const params: Record<string, string | number | boolean | undefined> = {
    ...toParams(q),
    page: undefined,
    page_size: undefined,
  };
  if (q.product_ids && q.product_ids.length > 0) {
    params.product_ids = q.product_ids.join(",");
  }
  const res = await api.get<Blob>("/purchasing/replenishment/export", {
    params,
    responseType: "blob",
  });
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data as BlobPart]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "replenishment_export.csv";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
