import api from "./axios";

export type CustomerNote = {
  id: number;
  customer_id: number;
  body: string;
  is_pinned: boolean;
  author_name?: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerActivityItem = {
  id: string;
  event_type: string;
  event_label: string;
  occurred_at: string;
  operator_name?: string | null;
  summary: string;
  detail_path?: string | null;
};

export async function fetchCustomerActivity(
  customerId: number,
  tenantId: number,
): Promise<CustomerActivityItem[]> {
  const { data } = await api.get<{ items: CustomerActivityItem[] }>(
    `customers/${customerId}/activity`,
    { params: { tenant_id: tenantId } },
  );
  return data.items ?? [];
}

export async function fetchCustomerNotes(customerId: number, tenantId: number): Promise<CustomerNote[]> {
  const { data } = await api.get<CustomerNote[]>(`customers/${customerId}/notes`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function createCustomerNote(
  customerId: number,
  tenantId: number,
  body: string,
  isPinned = false,
): Promise<CustomerNote> {
  const { data } = await api.post<CustomerNote>(
    `customers/${customerId}/notes`,
    { body, is_pinned: isPinned },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function updateCustomerNote(
  customerId: number,
  noteId: number,
  tenantId: number,
  patch: { body?: string; is_pinned?: boolean },
): Promise<CustomerNote> {
  const { data } = await api.patch<CustomerNote>(`customers/${customerId}/notes/${noteId}`, patch, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function deleteCustomerNote(
  customerId: number,
  noteId: number,
  tenantId: number,
): Promise<void> {
  await api.delete(`customers/${customerId}/notes/${noteId}`, {
    params: { tenant_id: tenantId },
  });
}
