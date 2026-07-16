import api from "./axios";

export type SystemLabelDto = {
  id: number;
  key: string;
  default_value: string;
  custom_value: string | null;
  resolved_value: string;
  tenant_id: number | null;
  description: string | null;
  category: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ResolvedLabelsResponse = {
  labels: Record<string, string>;
  defaults?: Record<string, string>;
  version: string;
};

export async function fetchResolvedLabels(): Promise<ResolvedLabelsResponse> {
  const { data } = await api.get<ResolvedLabelsResponse>("/system/labels/resolved");
  return data;
}

export async function fetchSystemLabels(params?: {
  q?: string;
  category?: string;
}): Promise<SystemLabelDto[]> {
  const { data } = await api.get<SystemLabelDto[]>("/system/labels", { params });
  return data;
}

export async function patchSystemLabel(
  id: number,
  custom_value: string | null,
): Promise<SystemLabelDto> {
  const { data } = await api.patch<SystemLabelDto>(`/system/labels/${id}`, { custom_value });
  return data;
}

export async function seedSystemLabels(): Promise<{ ok: boolean; inserted: number }> {
  const { data } = await api.post<{ ok: boolean; inserted: number }>("/system/labels/seed");
  return data;
}
