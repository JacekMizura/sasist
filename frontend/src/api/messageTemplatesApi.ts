import api from "./axios";

export type MessageTemplateChannel = "email" | "sms" | "note";

export type MessageTemplateAttachmentRef = {
  source: "order_custom_field";
  field_id: number;
  field_slug?: string;
  field_name?: string;
  field_type?: string;
};

export type MessageTemplateDto = {
  id: number;
  tenant_id: number;
  warehouse_id: number | null;
  code: string;
  name: string;
  channel: MessageTemplateChannel | string;
  channel_label?: string;
  supported_contexts: string[];
  supported_contexts_label?: string;
  subject_template: string;
  body_template: string;
  attachments: MessageTemplateAttachmentRef[];
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type MessageTemplateVariableDto = {
  key: string;
  token: string;
  label: string;
  description: string;
  group: string;
  group_label: string;
  value_kind: "TEXT" | "HTML" | "URL";
  supported_contexts: string[];
  aliases: string[];
};

export type MessageTemplateVariableGroupDto = {
  id: string;
  label: string;
  variables: MessageTemplateVariableDto[];
};

export type MessageTemplateAttachmentSourceDto = {
  source: "order_custom_field";
  field_id: number;
  field_slug: string;
  field_name: string;
  field_type: string;
  label: string;
};

/** Paths are relative to axios baseURL (already ends with `/api`). */
const BASE = "/message-templates";

export async function listMessageTemplates(opts: {
  tenantId: number;
  entityType?: string;
  warehouseId?: number | null;
  activeOnly?: boolean;
  /** Omit or "all" for admin list; pickers must pass "email". */
  channel?: MessageTemplateChannel | "all" | string;
}): Promise<MessageTemplateDto[]> {
  const params: Record<string, string | number | boolean> = {
    tenant_id: opts.tenantId,
  };
  if (opts.entityType) params.entity_type = opts.entityType;
  if (opts.warehouseId != null) params.warehouse_id = opts.warehouseId;
  if (opts.activeOnly != null) params.active_only = opts.activeOnly;
  if (opts.channel != null) params.channel = opts.channel;
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
  channel?: MessageTemplateChannel | string;
  attachments?: MessageTemplateAttachmentRef[];
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
    channel?: MessageTemplateChannel | string;
    attachments?: MessageTemplateAttachmentRef[];
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

export async function listMessageTemplateVariables(entityType?: string): Promise<MessageTemplateVariableGroupDto[]> {
  const { data } = await api.get<{ groups: MessageTemplateVariableGroupDto[] }>(`${BASE}/variables`, {
    params: entityType ? { entity_type: entityType } : undefined,
  });
  return Array.isArray(data?.groups) ? data.groups : [];
}

export async function listMessageTemplateAttachmentSources(opts: {
  tenantId: number;
  warehouseId: number;
}): Promise<MessageTemplateAttachmentSourceDto[]> {
  const { data } = await api.get<{ items: MessageTemplateAttachmentSourceDto[] }>(`${BASE}/attachment-sources`, {
    params: { tenant_id: opts.tenantId, warehouse_id: opts.warehouseId },
  });
  return Array.isArray(data?.items) ? data.items : [];
}

export async function previewMessageTemplate(body: {
  tenant_id: number;
  subject_template: string;
  body_template: string;
  entity_type?: string | null;
  entity_id?: number | null;
}): Promise<{
  subject: string;
  body_html: string;
  used_live_context: boolean;
  structural_preview: boolean;
  missing_variables: string[];
  unknown_variables: string[];
}> {
  const { data } = await api.post<{
    subject: string;
    body_html: string;
    used_live_context: boolean;
    structural_preview?: boolean;
    missing_variables?: string[];
    unknown_variables?: string[];
  }>(`${BASE}/preview`, body);
  return {
    subject: data.subject,
    body_html: data.body_html,
    used_live_context: data.used_live_context,
    structural_preview: Boolean(data.structural_preview ?? !data.used_live_context),
    missing_variables: Array.isArray(data.missing_variables) ? data.missing_variables : [],
    unknown_variables: Array.isArray(data.unknown_variables) ? data.unknown_variables : [],
  };
}

export function formatChannelLabel(channel: string | null | undefined): string {
  const c = String(channel || "email").toLowerCase();
  if (c === "sms") return "SMS";
  if (c === "note") return "Notatka";
  return "E-mail";
}
