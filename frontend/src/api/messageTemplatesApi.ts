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
};

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
  const { data } = await api.get<MessageTemplateDto[]>("/api/message-templates/", { params });
  return Array.isArray(data) ? data : [];
}
