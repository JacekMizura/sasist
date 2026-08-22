import api from "./axios";

export type MessageTemplateDto = {
  id: number;
  tenant_id: number;
  warehouse_id: number | null;
  code: string;
  name: string;
  channel: string;
  entity_scope: string;
  subject_template: string;
  body_template: string;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

/** Paths are relative to axios baseURL (already ends with `/api`). */
const BASE = "/message-templates";

export async function listMessageTemplates(opts: {
  tenantId: number;
  entityType?: string;
  warehouseId?: number | null;
  activeOnly?: boolean;
}): Promise<MessageTemplateDto[]> {
  const params: Record<string, string | number | boolean> = {
    tenant_id: opts.tenantId,
  };
  if (opts.entityType) params.entity_type = opts.entityType;
  if (opts.warehouseId != null) params.warehouse_id = opts.warehouseId;
  if (opts.activeOnly != null) params.active_only = opts.activeOnly;
  const { data } = await api.get<MessageTemplateDto[]>(`${BASE}/`, { params });
  return Array.isArray(data) ? data : [];
}

export async function getMessageTemplate(
  templateId: number,
  tenantId: number,
): Promise<MessageTemplateDto> {
  const { data } = await api.get<MessageTemplateDto>(`${BASE}/${templateId}`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function createMessageTemplate(body: {
  tenant_id: number;
  name: string;
  subject_template?: string;
  body_template?: string;
  entity_scope?: string;
  code?: string;
  warehouse_id?: number | null;
  is_active?: boolean;
}): Promise<MessageTemplateDto> {
  const { data } = await api.post<MessageTemplateDto>(`${BASE}/`, body);
  return data;
}

export async function updateMessageTemplate(
  templateId: number,
  tenantId: number,
  body: {
    name?: string;
    subject_template?: string;
    body_template?: string;
    entity_scope?: string;
    is_active?: boolean;
  },
): Promise<MessageTemplateDto> {
  const { data } = await api.patch<MessageTemplateDto>(`${BASE}/${templateId}`, body, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function archiveMessageTemplate(
  templateId: number,
  tenantId: number,
): Promise<MessageTemplateDto> {
  const { data } = await api.post<MessageTemplateDto>(
    `${BASE}/${templateId}/archive`,
    {},
    { params: { tenant_id: tenantId } },
  );
  return data;
}
