import api from "./axios";
import type { ApiKeyCreateBody, ApiKeyRead, ApiKeyUsageRead } from "../types/apiKeys";

export async function fetchApiKeys(tenantId: number): Promise<ApiKeyRead[]> {
  const { data } = await api.get<{ items: ApiKeyRead[] }>("/settings/api-keys", {
    params: { tenant_id: tenantId },
  });
  return Array.isArray(data.items) ? data.items : [];
}

export async function fetchApiKeyUsage(tenantId: number, keyId: number): Promise<ApiKeyUsageRead> {
  const { data } = await api.get<ApiKeyUsageRead>(`/settings/api-keys/${keyId}/usage`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function createApiKey(
  tenantId: number,
  body: ApiKeyCreateBody,
): Promise<{ key: ApiKeyRead; plain_key: string }> {
  const { data } = await api.post<{ key: ApiKeyRead; plain_key: string }>("/settings/api-keys", body, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function revokeApiKey(tenantId: number, keyId: number): Promise<ApiKeyRead> {
  const { data } = await api.patch<ApiKeyRead>(`/settings/api-keys/${keyId}/revoke`, null, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function regenerateApiKey(
  tenantId: number,
  keyId: number,
): Promise<{ key: ApiKeyRead; plain_key: string }> {
  const { data } = await api.post<{ key: ApiKeyRead; plain_key: string }>(
    `/settings/api-keys/${keyId}/regenerate`,
    {},
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function rotateApiKey(
  tenantId: number,
  keyId: number,
): Promise<{ key: ApiKeyRead; plain_key: string; rotated_from_id: number }> {
  const { data } = await api.post<{ key: ApiKeyRead; plain_key: string; rotated_from_id: number }>(
    `/settings/api-keys/${keyId}/rotate`,
    {},
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function deleteApiKey(tenantId: number, keyId: number): Promise<void> {
  await api.delete(`/settings/api-keys/${keyId}`, { params: { tenant_id: tenantId } });
}
