import api from "./axios";
import type { InventoryConflictsRead, InventoryUnknownProductRead } from "./inventoryCountTypes";

export async function fetchInventoryConflicts(
  tenantId: number,
  documentId: number,
): Promise<InventoryConflictsRead> {
  const { data } = await api.get<InventoryConflictsRead>(
    `/inventory-count/documents/${documentId}/conflicts`,
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function fetchInventoryUnknownProducts(
  tenantId: number,
  documentId: number,
  status = "draft",
): Promise<InventoryUnknownProductRead[]> {
  const { data } = await api.get<InventoryUnknownProductRead[]>(
    `/inventory-count/documents/${documentId}/unknown-products`,
    { params: { tenant_id: tenantId, status } },
  );
  return data;
}

export async function mapInventoryUnknownProduct(
  tenantId: number,
  unknownId: number,
  productId: number,
): Promise<InventoryUnknownProductRead> {
  const { data } = await api.post<InventoryUnknownProductRead>(
    `/inventory-count/unknown-products/${unknownId}/map`,
    { product_id: productId },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function rejectInventoryUnknownProduct(
  tenantId: number,
  unknownId: number,
  reason?: string,
): Promise<InventoryUnknownProductRead> {
  const { data } = await api.post<InventoryUnknownProductRead>(
    `/inventory-count/unknown-products/${unknownId}/reject`,
    { reason: reason ?? null },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function rejectInventoryConflictCount(
  tenantId: number,
  documentId: number,
  lineId: number,
  countId: number,
): Promise<{ line_id: number; count_entry_id: number; rejected: boolean; conflict_status: string }> {
  const { data } = await api.post<{ line_id: number; count_entry_id: number; rejected: boolean; conflict_status: string }>(
    `/inventory-count/documents/${documentId}/conflicts/reject`,
    { line_id: lineId, count_id: countId },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function requestInventoryConflictRecount(
  tenantId: number,
  documentId: number,
  lineId: number,
): Promise<{ recount_id: number; line_id: number; recounts_created: number }> {
  const { data } = await api.post<{ recount_id: number; line_id: number; recounts_created: number }>(
    `/inventory-count/documents/${documentId}/conflicts/recount`,
    { line_id: lineId },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function acceptInventoryConflictCount(
  tenantId: number,
  documentId: number,
  lineId: number,
  countId: number,
): Promise<{ line_id: number; count_entry_id: number; counted_quantity: number; operator_conflict_resolved: boolean }> {
  const { data } = await api.post<{ line_id: number; count_entry_id: number; counted_quantity: number; operator_conflict_resolved: boolean }>(
    `/inventory-count/documents/${documentId}/conflicts/accept`,
    { line_id: lineId, count_id: countId },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function generateInventoryRecounts(tenantId: number, documentId: number): Promise<{ recounts_created: number }> {
  const { data } = await api.post<{ recounts_created: number }>(
    `/inventory-count/documents/${documentId}/recounts/generate`,
    null,
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function completeInventoryRecount(
  tenantId: number,
  recountId: number,
  countedQuantity: number,
): Promise<{ recount_id: number; line_id: number; counted_quantity: number }> {
  const { data } = await api.post<{ recount_id: number; line_id: number; counted_quantity: number }>(
    `/inventory-count/recounts/${recountId}/complete`,
    { counted_quantity: countedQuantity },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export type { InventoryConflictsRead, InventoryUnknownProductRead };
