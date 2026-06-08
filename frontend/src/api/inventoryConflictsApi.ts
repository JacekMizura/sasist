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

export type { InventoryConflictsRead, InventoryUnknownProductRead };
