/** Required query params for all /direct-sales routes (router dependency). */

export type DirectSalesScope = {
  tenantId: number;
  warehouseId: number;
};

export function directSalesQuery(scope: DirectSalesScope): {
  tenant_id: number;
  warehouse_id: number;
} {
  return {
    tenant_id: scope.tenantId,
    warehouse_id: scope.warehouseId,
  };
}
