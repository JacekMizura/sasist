import api from "./axios";

export type PackagingMovementDto = {
  id: string;
  occurred_at: string;
  movement_type: string;
  document_type: string;
  document_number: string | null;
  document_id: number | null;
  wm_kind: "carton" | "packaging" | string;
  wm_id: string | null;
  material_name: string;
  sku: string | null;
  qty: number;
  warehouse_id: number | null;
  reference: string | null;
  notes: string | null;
};

export async function listWarehouseMaterialsMovements(
  tenantId: number,
  warehouseId: number,
  opts?: { movementType?: string; limit?: number },
): Promise<PackagingMovementDto[]> {
  const params: Record<string, string | number> = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
  };
  if (opts?.movementType) params.movement_type = opts.movementType;
  if (opts?.limit != null) params.limit = opts.limit;
  const res = await api.get<PackagingMovementDto[]>("/warehouse-materials/movements", { params });
  return res.data;
}
