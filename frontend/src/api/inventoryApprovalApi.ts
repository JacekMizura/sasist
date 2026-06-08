import api from "./axios";
import type { InventoryApprovalActionResult, InventoryDocumentRead, InventoryPostingPreview } from "./inventoryCountTypes";

export async function submitInventoryDocumentForApproval(
  tenantId: number,
  documentId: number,
  notes?: string | null,
): Promise<InventoryApprovalActionResult> {
  const { data } = await api.post<InventoryApprovalActionResult>(
    `/inventory-count/documents/${documentId}/submit-approval`,
    { notes: notes ?? null },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function approveInventoryDocument(
  tenantId: number,
  documentId: number,
  notes?: string | null,
): Promise<InventoryApprovalActionResult> {
  const { data } = await api.post<InventoryApprovalActionResult>(
    `/inventory-count/documents/${documentId}/approve`,
    { notes: notes ?? null },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function rejectInventoryDocument(
  tenantId: number,
  documentId: number,
  notes?: string | null,
): Promise<InventoryApprovalActionResult> {
  const { data } = await api.post<InventoryApprovalActionResult>(
    `/inventory-count/documents/${documentId}/reject`,
    { notes: notes ?? null },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function postInventoryDocumentAdjustments(
  tenantId: number,
  documentId: number,
): Promise<InventoryApprovalActionResult> {
  const { data } = await api.post<InventoryApprovalActionResult>(
    `/inventory-count/documents/${documentId}/post`,
    {},
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function fetchInventoryPostingPreview(
  tenantId: number,
  documentId: number,
): Promise<InventoryPostingPreview> {
  const { data } = await api.get<InventoryPostingPreview>(
    `/inventory-count/documents/${documentId}/posting-preview`,
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export type { InventoryDocumentRead, InventoryPostingPreview, InventoryApprovalActionResult };
