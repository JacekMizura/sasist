import api from "./axios";

export type WarehouseStockSnapshot = {
  warehouse_id: number;
  warehouse_name: string;
  physical_quantity: number;
  available_quantity: number;
  reserved_quantity: number;
  commercially_sellable_qty: number;
};

export type ProductWarehouseStockBreakdown = {
  product_id: number;
  tenant_id: number;
  warehouses: WarehouseStockSnapshot[];
  network_totals: {
    physical_quantity: number;
    available_quantity: number;
    reserved_quantity: number;
    commercially_sellable_qty: number;
    network_warehouse_ids?: number[];
  };
};

export type ProductWarehouseSlottingRow = {
  warehouse_id: number;
  warehouse_name: string;
  location_codes: string[];
};

export type ProductWarehouseSlottingAll = {
  product_id: number;
  tenant_id: number;
  warehouses: ProductWarehouseSlottingRow[];
};

export type OrderFulfillmentAssignmentAudit = {
  id: number;
  order_id: number;
  assigned_warehouse_id: number;
  assigned_warehouse_name: string;
  strategy: string;
  assigned_by_user_id: number | null;
  assigned_by_label: string;
  reason: string | null;
  created_at: string;
};

export type TenantWarehouseNetworkRow = {
  warehouse_id: number;
  warehouse_name: string;
  physical_quantity: number;
  commercially_sellable_qty: number;
  reserved_quantity: number;
};

export type TenantWarehouseNetworkSummary = {
  tenant_id: number;
  warehouses: TenantWarehouseNetworkRow[];
  totals: {
    physical_quantity: number;
    commercially_sellable_qty: number;
    reserved_quantity: number;
  };
};

export async function fetchProductWarehouseStockBreakdown(
  productId: number,
  tenantId: number,
): Promise<ProductWarehouseStockBreakdown> {
  const res = await api.get<ProductWarehouseStockBreakdown>(
    `/products/${productId}/warehouse-stock-breakdown`,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export type ProductBusinessReservationRow = {
  id: number;
  created_at: string | null;
  order_id: number;
  order_number: string;
  stock_document_id: number | null;
  document_number: string | null;
  product_id: number;
  product_name: string;
  warehouse_id: number;
  warehouse_name: string;
  quantity: number;
  quantity_original: number;
  status: string;
  status_label: string;
};

export async function fetchProductBusinessReservations(
  productId: number,
  tenantId: number,
  opts?: { warehouseId?: number; includeInactive?: boolean },
): Promise<ProductBusinessReservationRow[]> {
  const res = await api.get<{ items: ProductBusinessReservationRow[] }>(
    `/products/${productId}/business-reservations`,
    {
      params: {
        tenant_id: tenantId,
        warehouse_id: opts?.warehouseId,
        include_inactive: opts?.includeInactive ? true : undefined,
      },
    },
  );
  return res.data.items ?? [];
}

export async function fetchProductSlottingByWarehouse(
  productId: number,
  tenantId: number,
): Promise<ProductWarehouseSlottingAll> {
  const res = await api.get<ProductWarehouseSlottingAll>(`/products/${productId}/slotting-by-warehouse`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function fetchOrderFulfillmentAssignmentAudits(
  orderId: number,
): Promise<OrderFulfillmentAssignmentAudit[]> {
  const res = await api.get<OrderFulfillmentAssignmentAudit[]>(
    `/orders/${orderId}/fulfillment-assignment-audits`,
  );
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchTenantWarehouseNetworkSummary(
  tenantId: number,
): Promise<TenantWarehouseNetworkSummary> {
  const res = await api.get<TenantWarehouseNetworkSummary>(`/tenants/${tenantId}/warehouse-network-stock`);
  return res.data;
}

export function fmtStockQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(Number(n));
}
