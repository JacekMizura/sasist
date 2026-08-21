/** Returns report API client — grouped by RMZ for screen; export stays line-grain. */

import api from "./axios";

export type ReturnsReportDateField = "created" | "warehouse_commit" | "refund";
export type ReturnsReportSort =
  | "date"
  | "return_number"
  | "order_number"
  | "product_lines"
  | "qty"
  | "accepted"
  | "rejected"
  | "line_value"
  | "status";

export type ReturnsReportFilters = {
  tenantId: number;
  warehouseId?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  dateField?: ReturnsReportDateField;
  statusId?: number | null;
  decision?: string | null;
  productQuery?: string | null;
  orderQuery?: string | null;
  source?: string | null;
  country?: string | null;
  sort?: ReturnsReportSort;
  direction?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export type ReturnsReportLine = {
  return_line_id: number;
  product_id: number | null;
  product_name: string;
  sku: string;
  ean: string;
  qty_returned: number;
  qty_accepted: number;
  qty_rejected: number;
  qty_damaged_b: number;
  qty_damaged_c: number;
  qty_commercial: number;
  decision: string | null;
  decision_label: string;
  line_value: number;
  currency: string;
  purchase_cost_net: number | null;
  purchase_cost_is_current: boolean;
};

export type ReturnsReportGroup = {
  return: {
    return_id: number;
    return_number: string;
    order_id: number;
    order_number: string;
    return_date: string | null;
    status_id: number | null;
    status_name: string;
    customer_name: string;
    source: string | null;
    country: string | null;
    warehouse_id: number | null;
    warehouse_name: string;
    warehouse_committed: boolean;
    zpz_number: string | null;
    correction_number: string | null;
    correction_issued: boolean;
    currency: string;
  };
  aggregates: {
    product_lines: number;
    quantity: number;
    accepted_qty: number;
    rejected_qty: number;
    damaged_b_qty: number;
    damaged_c_qty: number;
    value_gross: number;
    products_label: string;
  };
  lines: ReturnsReportLine[];
};

export type ReturnsReportSummary = {
  returns_count: number;
  pieces_commercial: number;
  value_total: number;
  accepted_warehouse_qty: number;
  rejected_qty: number;
  currency: string;
};

export type ReturnsReportResponse = {
  items: ReturnsReportGroup[];
  page: number;
  limit: number;
  total: number;
  total_returns: number;
  pages: number;
  summary: ReturnsReportSummary;
};

function toParams(f: ReturnsReportFilters): Record<string, string | number> {
  const p: Record<string, string | number> = { tenant_id: f.tenantId };
  if (f.warehouseId != null) p.warehouse_id = f.warehouseId;
  if (f.dateFrom) p.date_from = f.dateFrom;
  if (f.dateTo) p.date_to = f.dateTo;
  if (f.dateField) p.date_field = f.dateField;
  if (f.statusId != null) p.status_id = f.statusId;
  if (f.decision) p.decision = f.decision;
  if (f.productQuery) p.product_query = f.productQuery;
  if (f.orderQuery) p.order_query = f.orderQuery;
  if (f.source) p.source = f.source;
  if (f.country) p.country = f.country;
  if (f.sort) p.sort = f.sort;
  if (f.direction) p.direction = f.direction;
  if (f.page != null) p.page = f.page;
  if (f.limit != null) p.limit = f.limit;
  return p;
}

export async function fetchReturnsReport(filters: ReturnsReportFilters): Promise<ReturnsReportResponse> {
  const res = await api.get<ReturnsReportResponse>("returns/report", { params: toParams(filters) });
  return res.data;
}

export function returnsReportExportUrl(filters: ReturnsReportFilters, format: "csv" | "xlsx"): string {
  const params = new URLSearchParams();
  const p = toParams(filters);
  for (const [k, v] of Object.entries(p)) {
    params.set(k, String(v));
  }
  params.set("format", format);
  const base = (api.defaults.baseURL || "/api").replace(/\/$/, "");
  return `${base}/returns/report/export?${params.toString()}`;
}
