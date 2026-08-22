import api from "./axios";

export type MessageTemplateDto = {
  id: number;
  tenant_id: number;
  warehouse_id: number | null;
  code: string;
  name: string;
  channel: string;
  supported_contexts: string[];
  supported_contexts_label?: string;
  subject_template: string;
  body_template: string;
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
  supported_contexts?: string[];
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
    supported_contexts?: string[];
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
  missing_variables: string[];
  unknown_variables: string[];
}> {
  const { data } = await api.post<{
    subject: string;
    body_html: string;
    used_live_context: boolean;
    missing_variables?: string[];
    unknown_variables?: string[];
  }>(`${BASE}/preview`, body);
  return {
    subject: data.subject,
    body_html: data.body_html,
    used_live_context: data.used_live_context,
    missing_variables: Array.isArray(data.missing_variables) ? data.missing_variables : [],
    unknown_variables: Array.isArray(data.unknown_variables) ? data.unknown_variables : [],
  };
}

const ALL_CONTEXTS = ["ORDER", "RETURN", "COMPLAINT"] as const;

/** Map module checkboxes → supported_contexts SSOT. */
export function supportedContextsFromModules(mods: {
  order: boolean;
  returns: boolean;
  complaints: boolean;
}): string[] {
  const selected: string[] = [];
  if (mods.order) selected.push("ORDER");
  if (mods.returns) selected.push("RETURN");
  if (mods.complaints) selected.push("COMPLAINT");
  return ALL_CONTEXTS.filter((c) => selected.includes(c));
}

export function modulesFromSupportedContexts(contexts: string[] | null | undefined): {
  order: boolean;
  returns: boolean;
  complaints: boolean;
} {
  const set = new Set((contexts || []).map((c) => String(c).toUpperCase()));
  if (set.size === 0) {
    return { order: true, returns: true, complaints: true };
  }
  return {
    order: set.has("ORDER"),
    returns: set.has("RETURN"),
    complaints: set.has("COMPLAINT"),
  };
}

export function formatSupportedContextsLabel(contexts: string[] | null | undefined): string {
  const list = (contexts || []).map((c) => String(c).toUpperCase());
  if (list.length === 0 || ALL_CONTEXTS.every((c) => list.includes(c))) return "Wszystkie moduły";
  const labels: Record<string, string> = {
    ORDER: "Zamówienia",
    RETURN: "Zwroty",
    COMPLAINT: "Reklamacje",
  };
  return ALL_CONTEXTS.filter((c) => list.includes(c))
    .map((c) => labels[c])
    .join(", ");
}
