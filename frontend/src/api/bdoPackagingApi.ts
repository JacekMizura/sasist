import api from "./axios";

export type BdoWmKind = "packaging" | "carton";

export type BdoWmCatalogRow = {
  wm_ref: string;
  kind: BdoWmKind;
  warehouse_id: number;
  name: string;
  sku: string | null;
  category: string;
  unit: string;
  stock: number;
  is_active: boolean;
  include_in_bdo: boolean;
  packaging_type: string | null;
  plastic_kg_per_unit: number;
  paper_kg_per_unit: number;
  wood_kg_per_unit: number;
  glass_kg_per_unit: number;
  metal_kg_per_unit: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type BdoPurchase = {
  id: number;
  tenant_id: number;
  wm_ref: string;
  material_name: string;
  purchase_date: string;
  supplier_name: string;
  qty: number;
  unit_cost: number | null;
  total: number | null;
  document_no: string | null;
  notes: string | null;
  created_at?: string | null;
};

export type BdoStockCountLine = {
  wm_ref: string;
  material_name: string;
  system_stock: number;
  counted_stock: number;
  difference: number;
  notes: string | null;
};

export type BdoStockCount = {
  id: number;
  tenant_id: number;
  count_date: string;
  period_label: string | null;
  notes: string | null;
  created_by_label: string | null;
  created_at?: string | null;
  lines: BdoStockCountLine[];
};

export type BdoCorrectionReason =
  | "damage"
  | "disposal"
  | "returned_supplier"
  | "internal_usage"
  | "opening_balance";

export type BdoCorrection = {
  id: number;
  tenant_id: number;
  wm_ref: string;
  material_name: string;
  correction_date: string;
  qty: number;
  reason: BdoCorrectionReason | string;
  notes: string | null;
  created_at?: string | null;
};

export type BdoSettings = {
  tenant_id: number;
  reporting_company_name: string | null;
  registration_numbers: string | null;
  default_methodology_text: string | null;
  allow_negative_stock: boolean;
  updated_at?: string | null;
};

export type BdoDashboard = {
  materials_tracked: number;
  estimated_plastic_kg: number;
  estimated_paper_kg: number;
  month_purchases_pln: number;
  last_report_month_label: string | null;
  missing_stock_counts: number;
  ledger_plastic_kg: number;
  ledger_paper_kg: number;
};

export type BdoMovement = {
  id: string;
  occurred_at: string;
  movement_type: string;
  wm_ref?: string | null;
  material_name: string;
  qty?: number | null;
  amount_pln?: number | null;
  reference?: string | null;
  notes?: string | null;
};

export type BdoAudit = {
  id: number;
  created_at?: string | null;
  action: string;
  detail: string | null;
  user_label: string | null;
};

export type BdoMonthlyReportRow = {
  wm_ref: string;
  material_name: string;
  sku: string | null;
  beginning_qty: number;
  purchased_qty: number;
  corrections_qty: number;
  ending_qty: number | null;
  used_qty: number | null;
  plastic_kg: number;
  paper_kg: number;
  wood_kg: number;
  glass_kg: number;
  metal_kg: number;
};

export type BdoMonthlyReport = {
  year: number;
  month: number;
  methodology_note: string | null;
  totals_plastic_kg: number;
  totals_paper_kg: number;
  totals_wood_kg: number;
  totals_glass_kg: number;
  totals_metal_kg: number;
  rows: BdoMonthlyReportRow[];
};

const base = "/warehouse/bdo";

export async function fetchBdoLedgerPreview(
  tenantId: number,
  warehouseId: number,
  asOf: string,
): Promise<Record<string, number>> {
  const res = await api.get<Record<string, number>>(`${base}/ledger-preview`, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, as_of: asOf },
  });
  return res.data;
}

export async function fetchBdoDashboard(tenantId: number, warehouseId?: number | null): Promise<BdoDashboard> {
  const params: Record<string, string | number> = { tenant_id: tenantId };
  if (warehouseId != null) params.warehouse_id = warehouseId;
  const res = await api.get<BdoDashboard>(`${base}/dashboard`, { params });
  return res.data;
}

export async function fetchBdoRecent(tenantId: number, limit = 30): Promise<BdoAudit[]> {
  const res = await api.get<BdoAudit[]>(`${base}/dashboard/recent`, { params: { tenant_id: tenantId, limit } });
  return res.data;
}

export async function listBdoCatalog(
  tenantId: number,
  warehouseId: number,
  opts?: { include_in_bdo_only?: boolean; active_only?: boolean },
): Promise<BdoWmCatalogRow[]> {
  const res = await api.get<BdoWmCatalogRow[]>(`${base}/catalog`, {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      include_in_bdo_only: opts?.include_in_bdo_only ?? false,
      active_only: opts?.active_only ?? false,
    },
  });
  return res.data;
}

export async function patchBdoWmFields(
  tenantId: number,
  warehouseId: number,
  body: {
    wm_ref: string;
    plastic_kg_per_unit?: number;
    paper_kg_per_unit?: number;
    wood_kg_per_unit?: number;
    glass_kg_per_unit?: number;
    metal_kg_per_unit?: number;
    packaging_type?: string | null;
    include_in_bdo?: boolean;
  },
): Promise<BdoWmCatalogRow> {
  const res = await api.patch<BdoWmCatalogRow>(`${base}/catalog/wm-fields`, body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function listBdoPurchases(tenantId: number, wmRef?: string | null): Promise<BdoPurchase[]> {
  const params: Record<string, string | number> = { tenant_id: tenantId };
  if (wmRef) params.wm_ref = wmRef;
  const res = await api.get<BdoPurchase[]>(`${base}/purchases`, { params });
  return res.data;
}

export async function createBdoPurchase(payload: {
  tenant_id: number;
  wm_ref: string;
  purchase_date: string;
  supplier_name?: string;
  qty: number;
  unit_cost?: number | null;
  total?: number | null;
  document_no?: string | null;
  notes?: string | null;
}): Promise<BdoPurchase> {
  const res = await api.post<BdoPurchase>(`${base}/purchases`, payload);
  return res.data;
}

export async function listBdoMovements(
  tenantId: number,
  opts?: {
    warehouseId?: number;
    dateFrom?: string;
    dateTo?: string;
    movementType?: string;
    limit?: number;
  },
): Promise<BdoMovement[]> {
  const params: Record<string, string | number> = { tenant_id: tenantId };
  if (opts?.warehouseId != null) params.warehouse_id = opts.warehouseId;
  if (opts?.dateFrom) params.date_from = opts.dateFrom;
  if (opts?.dateTo) params.date_to = opts.dateTo;
  if (opts?.movementType) params.movement_type = opts.movementType;
  if (opts?.limit != null) params.limit = opts.limit;
  const res = await api.get<BdoMovement[]>(`${base}/movements`, { params });
  return res.data;
}

export async function listBdoStockCounts(tenantId: number): Promise<BdoStockCount[]> {
  const res = await api.get<BdoStockCount[]>(`${base}/stock-counts`, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function createBdoStockCount(payload: {
  tenant_id: number;
  count_date: string;
  period_label?: string | null;
  notes?: string | null;
  created_by_label?: string | null;
  lines: { wm_ref: string; counted_stock: number; notes?: string | null }[];
}): Promise<BdoStockCount> {
  const res = await api.post<BdoStockCount>(`${base}/stock-counts`, payload);
  return res.data;
}

export async function listBdoCorrections(tenantId: number): Promise<BdoCorrection[]> {
  const res = await api.get<BdoCorrection[]>(`${base}/corrections`, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function createBdoCorrection(payload: {
  tenant_id: number;
  wm_ref: string;
  correction_date: string;
  qty: number;
  reason: BdoCorrectionReason;
  notes?: string | null;
}): Promise<BdoCorrection> {
  const res = await api.post<BdoCorrection>(`${base}/corrections`, payload);
  return res.data;
}

export async function getBdoSettings(tenantId: number): Promise<BdoSettings> {
  const res = await api.get<BdoSettings>(`${base}/settings`, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function putBdoSettings(tenantId: number, body: Partial<BdoSettings>): Promise<BdoSettings> {
  const res = await api.put<BdoSettings>(`${base}/settings`, body, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function fetchBdoMonthlyReport(
  tenantId: number,
  year: number,
  month: number,
  warehouseId?: number | null,
): Promise<BdoMonthlyReport> {
  const params: Record<string, string | number> = { tenant_id: tenantId, year, month };
  if (warehouseId != null) params.warehouse_id = warehouseId;
  const res = await api.get<BdoMonthlyReport>(`${base}/reports/monthly`, { params });
  return res.data;
}

export function bdoMonthlyReportCsvUrl(tenantId: number, year: number, month: number, warehouseId?: number | null): string {
  const p = new URLSearchParams({ tenant_id: String(tenantId), year: String(year), month: String(month) });
  if (warehouseId != null) p.set("warehouse_id", String(warehouseId));
  const root = (api.defaults.baseURL || "").replace(/\/$/, "");
  return `${root}${base}/reports/monthly.csv?${p.toString()}`;
}

export function bdoMonthlyReportXlsxUrl(tenantId: number, year: number, month: number, warehouseId?: number | null): string {
  const p = new URLSearchParams({ tenant_id: String(tenantId), year: String(year), month: String(month) });
  if (warehouseId != null) p.set("warehouse_id", String(warehouseId));
  const root = (api.defaults.baseURL || "").replace(/\/$/, "");
  return `${root}${base}/reports/monthly.xlsx?${p.toString()}`;
}
