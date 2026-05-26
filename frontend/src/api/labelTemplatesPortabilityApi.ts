import api from "./axios";

const tenant = (tenantId: number) => ({ tenant_id: tenantId });

export type LabelImportMode = "create_new" | "overwrite_by_name" | "duplicate_suffix";

export type LabelTemplateImportPreview = {
  schema_version?: number | null;
  kind?: string | null;
  valid_count: number;
  error_count: number;
  errors: string[];
  previews: {
    index: number;
    name?: string | null;
    template_type?: string | null;
    source_id?: number | null;
    valid?: boolean;
    error?: string | null;
  }[];
  normalized_templates: Record<string, unknown>[];
};

export type LabelTemplateImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  details: { name: string; action: string; reason?: string }[];
  validation_errors?: string[];
};

export async function exportLabelTemplatesJson(tenantId: number, ids: number[]): Promise<void> {
  const res = await api.post<Record<string, unknown>>("/label-templates/portability/export", { ...tenant(tenantId), ids });
  const text = JSON.stringify(res.data, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const filename = `label_templates_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function previewLabelTemplatesImport(tenantId: number, payload: object): Promise<LabelTemplateImportPreview> {
  const res = await api.post<LabelTemplateImportPreview>("/label-templates/portability/import-preview", {
    ...tenant(tenantId),
    payload,
  });
  return res.data;
}

export async function commitLabelTemplatesImport(
  tenantId: number,
  mode: LabelImportMode,
  templates: Record<string, unknown>[],
  defaultGroupId?: number | null
): Promise<LabelTemplateImportSummary> {
  const res = await api.post<LabelTemplateImportSummary>("/label-templates/portability/import-commit", {
    ...tenant(tenantId),
    mode,
    templates,
    default_group_id: defaultGroupId ?? null,
  });
  return res.data;
}
