import api from "./axios";

export type PurchaseHistoryStatusBadge = {
  id: number | null;
  name: string;
  color: string;
  main_group: string;
};

export type PurchaseHistoryProductPreview = {
  product_id: number | null;
  name: string;
  ean: string | null;
  sku: string | null;
  image_url: string | null;
  quantity: number;
};

export type PurchaseHistoryDocumentRow = {
  lp: number;
  order_id: number;
  document_number: string;
  order_date: string | null;
  status: PurchaseHistoryStatusBadge;
  products_preview: PurchaseHistoryProductPreview[];
  line_count: number;
  net: number;
  vat: number;
  gross: number;
  warehouse_id: number | null;
  warehouse_name: string | null;
  operator_name: string | null;
  order_channel: string;
  is_paid: boolean;
  detail_path: string;
};

export type FilterOptionItem = { id: number | string; name: string };

export type PurchaseHistoryFilterOptions = {
  warehouses: FilterOptionItem[];
  operators: FilterOptionItem[];
  statuses: FilterOptionItem[];
  channels: FilterOptionItem[];
};

export type PurchaseHistorySummary = {
  total_gross: number;
  total_net: number;
  total_vat: number;
  order_count: number;
  avg_basket_gross: number;
  last_purchase_at: string | null;
  total_products_qty: number;
  returns_corrections_count: number;
  avg_days_between_orders: number | null;
  gross_30d?: number;
  gross_90d?: number;
  gross_365d?: number;
  max_order_gross?: number;
  stats_computed_at: string | null;
  filter_options: PurchaseHistoryFilterOptions;
};

export type PurchaseHistoryListResponse = {
  items: PurchaseHistoryDocumentRow[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type TopProductRow = {
  product_id: number;
  name: string;
  ean: string | null;
  sku: string | null;
  image_url: string | null;
  purchase_count: number;
  total_quantity: number;
  total_gross: number;
  last_purchased_at: string | null;
  detail_path: string;
};

export type PurchaseTrendPoint = { period: string; gross: number };

export type PurchaseTrendResponse = {
  granularity: string;
  points: PurchaseTrendPoint[];
};

export type PurchaseHistoryQueryFilters = {
  date_from?: string;
  date_to?: string;
  gross_min?: number;
  gross_max?: number;
  order_ui_status_id?: number;
  warehouse_id?: number;
  operator_user_id?: number;
  order_channel?: string;
  paid_only?: boolean;
  completed_only?: boolean;
};

function filterParams(f: PurchaseHistoryQueryFilters): Record<string, string | number | boolean> {
  const p: Record<string, string | number | boolean> = {};
  if (f.date_from?.trim()) p.date_from = f.date_from.trim();
  if (f.date_to?.trim()) p.date_to = f.date_to.trim();
  if (f.gross_min != null && Number.isFinite(f.gross_min)) p.gross_min = f.gross_min;
  if (f.gross_max != null && Number.isFinite(f.gross_max)) p.gross_max = f.gross_max;
  if (f.order_ui_status_id != null) p.order_ui_status_id = f.order_ui_status_id;
  if (f.warehouse_id != null) p.warehouse_id = f.warehouse_id;
  if (f.operator_user_id != null) p.operator_user_id = f.operator_user_id;
  if (f.order_channel?.trim()) p.order_channel = f.order_channel.trim();
  if (f.paid_only) p.paid_only = true;
  if (f.completed_only) p.completed_only = true;
  return p;
}

export async function fetchCustomerPurchaseSummary(
  customerId: number,
  tenantId: number,
  filters: PurchaseHistoryQueryFilters = {},
): Promise<PurchaseHistorySummary> {
  const { data } = await api.get<PurchaseHistorySummary>(`/customers/${customerId}/purchase-history/summary`, {
    params: { tenant_id: tenantId, ...filterParams(filters) },
  });
  return data;
}

export async function fetchCustomerPurchaseDocuments(
  customerId: number,
  tenantId: number,
  filters: PurchaseHistoryQueryFilters = {},
  opts: { page?: number; page_size?: number; sort_by?: string; sort_dir?: string } = {},
): Promise<PurchaseHistoryListResponse> {
  const { data } = await api.get<PurchaseHistoryListResponse>(
    `/customers/${customerId}/purchase-history/documents`,
    {
      params: {
        tenant_id: tenantId,
        page: opts.page ?? 1,
        page_size: opts.page_size ?? 25,
        sort_by: opts.sort_by ?? "date",
        sort_dir: opts.sort_dir ?? "desc",
        ...filterParams(filters),
      },
    },
  );
  return data;
}

export async function fetchCustomerTopProducts(
  customerId: number,
  tenantId: number,
  filters: PurchaseHistoryQueryFilters = {},
  limit = 10,
): Promise<{ items: TopProductRow[] }> {
  const { data } = await api.get<{ items: TopProductRow[] }>(
    `/customers/${customerId}/purchase-history/top-products`,
    {
      params: { tenant_id: tenantId, limit, ...filterParams(filters) },
    },
  );
  return data;
}

export async function fetchCustomerPurchaseTrend(
  customerId: number,
  tenantId: number,
  filters: PurchaseHistoryQueryFilters = {},
  granularity: "day" | "week" | "month" = "month",
): Promise<PurchaseTrendResponse> {
  const { data } = await api.get<PurchaseTrendResponse>(`/customers/${customerId}/purchase-history/trend`, {
    params: { tenant_id: tenantId, granularity, ...filterParams(filters) },
  });
  return data;
}
