import api from "./axios";

export type DocumentTemplateKindDto = {
  id: number;
  code: string;
  name_pl: string;
  provider_key: string;
  schema_key: string;
};

export type DocumentTemplateFamilyDto = {
  id: number;
  code: string;
  name_pl: string;
  icon: string | null;
  kinds: DocumentTemplateKindDto[];
};

export type DocumentTemplateVersionDto = {
  id: number;
  version_number: number;
  status: "draft" | "published" | "archived";
  status_label?: string;
  extends_version_id?: number | null;
  partial_pins_json?: string | null;
  change_summary: string | null;
  published_at: string | null;
  updated_at: string | null;
  author_name?: string | null;
  published_by_name?: string | null;
  twig_content?: string;
};

export type VariableFieldDto = {
  path: string;
  label: string;
  type: string;
  description?: string;
  sample_value?: string;
  required?: boolean;
  provider_key?: string;
  provider_label?: string;
  is_collection?: boolean;
  loop_usable?: boolean;
  loop_var?: string;
  insert?: string;
};

export type TemplateUsageBadge = {
  label: string;
  count: number;
};

export type TemplateAssignmentItem = {
  scope_type: string;
  scope_type_label: string;
  scope_id: number | string;
  scope_label: string;
  kind_code: string | null;
  kind_name: string | null;
  version_id: number | null;
  extra?: string | null;
  erp_link?: string | null;
};

export type ScopeAssignmentDto = {
  id: number;
  tenant_id: number;
  scope_type: string;
  scope_type_label: string;
  scope_id: number;
  kind_code: string | null;
  kind_name: string | null;
  variant_code: string;
  version_id: number;
  version_number: number | null;
  template_id: number | null;
  template_name: string | null;
};

export type DocumentTemplateListItemDto = {
  id: number;
  name: string;
  template_role: string;
  template_role_label: string;
  template_code: string | null;
  source: string;
  source_label: string;
  family: { code: string; name_pl: string } | null;
  kind: DocumentTemplateKindDto | null;
  variants: string[];
  display_status: string;
  display_status_label: string;
  published_version: DocumentTemplateVersionDto | null;
  draft_version: DocumentTemplateVersionDto | null;
  binding_summary: string | null;
  used_as_labels?: string[];
  has_newer_draft?: boolean;
  usage_summary?: TemplateUsageBadge[];
  usage_total?: number;
  last_published_at: string | null;
  last_edited_at?: string | null;
  last_edited_by_name?: string | null;
  author_name: string | null;
  can_delete?: boolean;
  updated_at: string | null;
};

export type DocumentTemplateDetailDto = {
  id: number;
  tenant_id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  template_role?: string;
  template_code?: string | null;
  source?: string;
  kind: DocumentTemplateKindDto | null;
  published_version: DocumentTemplateVersionDto | null;
  draft_version: DocumentTemplateVersionDto | null;
  versions: (DocumentTemplateVersionDto | null)[];
  twig_content?: string;
  active_version_id?: number;
  updated_at: string | null;
};

export type VariableTreeNode = {
  label: string;
  icon?: string;
  type?: string;
  insert?: string;
  path?: string;
  description?: string;
  sample_value?: string;
  required?: boolean;
  provider_label?: string;
  is_collection?: boolean;
  loop_usable?: boolean;
  children?: VariableTreeNode[];
};

export type EditorCatalogItem = { name: string; insert: string };

export type ValidationIssue = {
  line: number | null;
  column: number | null;
  code: string;
  message: string;
  suggestion: string | null;
};

export type ValidationReport = {
  ok: boolean;
  issues: ValidationIssue[];
};

export type EditorContextDto = {
  detail: DocumentTemplateDetailDto;
  extends_base: {
    template_id: number;
    template_code: string;
    template_name: string;
    pinned_version: DocumentTemplateVersionDto;
  } | null;
  partials_used: Array<{
    partial_code: string;
    is_pinned: boolean;
    pinned_version: DocumentTemplateVersionDto | null;
    latest_published: DocumentTemplateVersionDto | null;
    has_newer_version: boolean;
  }>;
  bindings: Array<{
    id: number;
    kind_code: string | null;
    kind_name: string | null;
    variant_code: string;
    warehouse_id: number | null;
    version_id: number | null;
  }>;
  erp_assignments?: TemplateAssignmentItem[];
  versions_history: DocumentTemplateVersionDto[];
  variable_tree: VariableTreeNode[];
  variable_fields?: VariableFieldDto[];
  catalog: { helpers: EditorCatalogItem[]; tags: EditorCatalogItem[] };
  base_templates: LayoutTemplateDto[];
  partial_templates: LayoutTemplateDto[];
  dependencies: DependencyGraphDto | null;
  impact: EditorImpactDto | null;
  preview_pins?: {
    extends_version_id: number | null;
    partial_pins_json: string | null;
  };
};

export type LayoutTemplateDto = {
  id: number;
  template_code: string;
  name: string;
  source: string;
  published_versions: DocumentTemplateVersionDto[];
};

export type DependencyGraphDto = {
  root_version_id: number;
  nodes: Array<Record<string, unknown>>;
  edges: Array<{ from: number; to: number; type: string; partial_code?: string }>;
};

export type VersionCompareDto = {
  left: DocumentTemplateVersionDto & { twig_content: string };
  right: DocumentTemplateVersionDto & { twig_content: string };
};

export type UsageSearchHit = {
  template_id: number;
  template_name: string;
  template_code: string | null;
  kind_code: string | null;
  version_number: number;
  status: string;
  lines: number[];
};

export type StarterGalleryItem = {
  id: number;
  code: string;
  name_pl: string;
  description: string | null;
  kind_code: string | null;
  kind_name: string | null;
  family_code: string | null;
  family_name: string | null;
  is_system: boolean;
  updated_at: string | null;
  author_label?: string;
  tags?: string[];
  categories?: string[];
  thumbnail_url: string;
  usage_count?: number;
};

export type StarterGalleryResponse = {
  items: StarterGalleryItem[];
  total: number;
  families: string[];
  kinds: string[];
  tags: string[];
};

export type StarterGalleryDetailDto = {
  id: number;
  code: string;
  name_pl: string;
  description: string | null;
  kind_code: string | null;
  kind_name: string | null;
  family_code: string | null;
  family_name: string | null;
  is_system: boolean;
  author_label: string;
  updated_at: string | null;
  thumbnail_url: string;
  preview_html: string;
  twig_content?: string;
  base_template: { template_name: string; version_id: number; version_number: number } | null;
  partials_used: Array<{ partial_code: string; template_name: string; version_id: number }>;
  variables: unknown[];
};

export type PublishedTemplateOptionDto = {
  template_id: number;
  version_id: number;
  version_number: number;
  template_name: string;
  description?: string | null;
  kind_code: string | null;
  kind_name: string | null;
  variant_code: string;
  status: string;
  status_label: string;
  label: string;
  published_at: string | null;
  is_default_binding: boolean;
  thumbnail_url?: string | null;
};

export type EditorImpactDto = {
  uses_base: Record<string, unknown> | null;
  uses_partials: Array<Record<string, unknown>>;
  dependents: Array<Record<string, unknown>>;
  messages: string[];
};

const DEFAULT_TENANT = 1;

export async function fetchDocumentTemplateCatalog() {
  const { data } = await api.get<{ families: DocumentTemplateFamilyDto[] }>("/document-templates/catalog");
  return data.families;
}

export async function fetchDocumentTemplatesList(
  tenantId: number,
  filters?: {
    family_code?: string;
    kind_code?: string;
    variant_code?: string;
    status?: string;
    source?: string;
    template_role?: string;
  },
) {
  const { data } = await api.get<{ items: DocumentTemplateListItemDto[] }>("/document-templates/templates/list", {
    params: { tenant_id: tenantId, ...filters },
  });
  return data.items;
}

export async function fetchDocumentTemplate(tenantId: number, templateId: number) {
  const { data } = await api.get<DocumentTemplateDetailDto>(`/document-templates/templates/${templateId}`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function fetchEditorContext(tenantId: number, templateId: number) {
  const { data } = await api.get<EditorContextDto>(`/document-templates/templates/${templateId}/editor`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function createDocumentTemplateFromStarter(
  tenantId: number,
  payload: { kind_code: string; name: string; starter_code?: string; variant_code?: string },
) {
  const { data } = await api.post<DocumentTemplateDetailDto>(
    "/document-templates/templates/from-starter",
    payload,
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function updateDocumentTemplate(
  tenantId: number,
  templateId: number,
  payload: { name: string },
) {
  const { data } = await api.patch<DocumentTemplateDetailDto>(
    `/document-templates/templates/${templateId}`,
    payload,
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function saveDocumentTemplateDraft(
  tenantId: number,
  templateId: number,
  payload: {
    twig_content: string;
    change_summary?: string;
    extends_version_id?: number | null;
    partial_pins_json?: string | null;
  },
) {
  const { data } = await api.put<DocumentTemplateDetailDto>(
    `/document-templates/templates/${templateId}/draft`,
    payload,
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function publishDocumentTemplate(
  tenantId: number,
  templateId: number,
  versionId?: number,
  changeSummary?: string,
) {
  const { data } = await api.post<DocumentTemplateDetailDto>(
    `/document-templates/templates/${templateId}/publish`,
    { version_id: versionId ?? null, change_summary: changeSummary ?? null },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function validateDocumentVersion(
  versionId: number,
  kindCode?: string,
): Promise<ValidationReport> {
  const { data } = await api.post<ValidationReport>(`/document-templates/versions/${versionId}/validate`, null, {
    params: { kind_code: kindCode },
  });
  return data;
}

export async function previewDocumentHtml(
  tenantId: number,
  payload: {
    kind_code: string;
    twig_content: string;
    params?: Record<string, unknown>;
    warehouse_id?: number;
    version_id?: number;
    context_mode?: "sample" | "live";
    extends_version_id?: number | null;
    partial_pins_json?: string | null;
  },
) {
  const { data } = await api.post<string>("/document-templates/preview/html", payload, {
    params: { tenant_id: tenantId },
    responseType: "text",
    headers: { Accept: "text/html" },
  });
  return data;
}

export async function previewDocumentPdf(
  tenantId: number,
  payload: {
    kind_code: string;
    twig_content: string;
    params?: Record<string, unknown>;
    warehouse_id?: number;
    version_id?: number;
    context_mode?: "sample" | "live";
    extends_version_id?: number | null;
    partial_pins_json?: string | null;
  },
) {
  try {
    const { data } = await api.post<Blob>("/document-templates/preview/pdf", payload, {
      params: { tenant_id: tenantId },
      responseType: "blob",
    });
    return data;
  } catch (err) {
    if (err && typeof err === "object" && "response" in err) {
      const res = (err as { response?: { data?: unknown } }).response;
      if (res?.data instanceof Blob) {
        const text = await res.data.text();
        try {
          const parsed = JSON.parse(text) as { detail?: unknown };
          if (typeof parsed.detail === "string" && parsed.detail.trim()) {
            throw new Error(parsed.detail.trim());
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message && parseErr.message !== text.trim()) {
            throw parseErr;
          }
          if (text.trim()) throw new Error(text.trim());
        }
      }
    }
    throw err;
  }
}

export async function bindDocumentTemplate(
  tenantId: number,
  payload: {
    kind_code: string;
    template_id: number;
    version_id?: number | null;
    warehouse_id?: number | null;
    variant_code?: string;
    priority?: number;
  },
) {
  const { data } = await api.post("/document-templates/bindings", payload, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function migrateDefaultBindings(tenantId: number) {
  const { data } = await api.post<{ results: unknown[] }>("/document-templates/migrate-default-bindings", null, {
    params: { tenant_id: tenantId },
  });
  return data.results;
}

/** @deprecated use fetchDocumentTemplatesList */
export async function fetchDocumentTemplates(tenantId: number, kindCode?: string) {
  return fetchDocumentTemplatesList(tenantId, { kind_code: kindCode });
}

export async function fetchDocumentVariableTree(kindCode: string) {
  const { data } = await api.get<{ tree: VariableTreeNode[] }>("/document-templates/variable-tree", {
    params: { kind_code: kindCode },
  });
  return data.tree;
}

export async function fetchDocumentStarters(kindCode: string) {
  const { data } = await api.get<{ items: { id: number; code: string; name_pl: string }[] }>(
    "/document-templates/starters",
    { params: { kind_code: kindCode } },
  );
  return data.items;
}

export async function exportDocumentStarter(starterId: number) {
  const { data } = await api.get<Record<string, unknown>>(`/document-templates/starters/${starterId}/export`);
  return data;
}

export async function importDocumentStarter(payload: {
  kind_code: string;
  code?: string;
  payload: Record<string, unknown>;
}) {
  const { data } = await api.post<{ id: number; kind_code: string; code: string }>(
    "/document-templates/starters/import",
    payload,
  );
  return data;
}

export async function cloneDocumentStarter(
  starterId: number,
  payload?: { new_code?: string; name_pl?: string },
) {
  const { data } = await api.post<{ id: number; kind_code: string; code: string }>(
    `/document-templates/starters/${starterId}/clone`,
    payload ?? {},
  );
  return data;
}

export async function fetchDocumentSchemaFields(kindCode: string) {
  const { data } = await api.get<{ fields: VariableFieldDto[] }>(
    "/document-templates/schema-fields",
    { params: { kind_code: kindCode } },
  );
  return data.fields;
}

export async function liveValidateDocumentTemplate(
  tenantId: number,
  payload: { kind_code: string; twig_content: string },
) {
  const { data } = await api.post<ValidationReport>("/document-templates/validate/live", payload, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function compareDocumentVersions(leftVersionId: number, rightVersionId: number) {
  const { data } = await api.get<VersionCompareDto>("/document-templates/versions/compare", {
    params: { left_version_id: leftVersionId, right_version_id: rightVersionId },
  });
  return data;
}

export async function fetchVersionContent(versionId: number) {
  const { data } = await api.get<DocumentTemplateVersionDto & { twig_content: string }>(
    `/document-templates/versions/${versionId}/content`,
  );
  return data;
}

export async function searchSymbolUsage(
  tenantId: number,
  payload: { symbol: string; symbol_type?: "variable" | "helper" | "partial" | "base" },
) {
  const { data } = await api.post<{ items: UsageSearchHit[] }>("/document-templates/usage/search", payload, {
    params: { tenant_id: tenantId },
  });
  return data.items;
}

export async function fetchStarterGallery(tenantId: number = DEFAULT_TENANT) {
  const { data } = await api.get<StarterGalleryResponse>("/document-templates/starters/gallery", {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function fetchStarterGalleryDetail(tenantId: number, starterId: number) {
  const { data } = await api.get<StarterGalleryDetailDto>(`/document-templates/starters/${starterId}`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function fetchStarterThumbnailBlob(tenantId: number, starterId: number) {
  const { data } = await api.get<Blob>(`/document-templates/starters/${starterId}/thumbnail`, {
    params: { tenant_id: tenantId },
    responseType: "blob",
  });
  return data;
}

export async function fetchTemplateVersionThumbnailBlob(tenantId: number, versionId: number) {
  const { data } = await api.get<Blob>(`/document-templates/versions/${versionId}/thumbnail`, {
    params: { tenant_id: tenantId },
    responseType: "blob",
  });
  return data;
}

export async function fetchPublishedTemplateOptions(
  tenantId: number,
  filters?: { kind_code?: string; variant_code?: string; search?: string },
) {
  const { data } = await api.get<{ items: PublishedTemplateOptionDto[] }>("/document-templates/published-options", {
    params: { tenant_id: tenantId, ...filters },
  });
  return data.items;
}

export async function exportTemplateZip(tenantId: number, templateId: number) {
  const { data } = await api.get<Blob>(`/document-templates/templates/${templateId}/export`, {
    params: { tenant_id: tenantId },
    responseType: "blob",
  });
  return data;
}

export async function exportFamilyZip(tenantId: number, familyCode: string) {
  const { data } = await api.get<Blob>(`/document-templates/export/family/${familyCode}`, {
    params: { tenant_id: tenantId },
    responseType: "blob",
  });
  return data;
}

export async function exportFullPackageZip(tenantId: number) {
  const { data } = await api.get<Blob>("/document-templates/export/package", {
    params: { tenant_id: tenantId },
    responseType: "blob",
  });
  return data;
}

export async function fetchScopeAssignments(tenantId: number, scopeType: string, scopeId: number) {
  const { data } = await api.get<{ items: ScopeAssignmentDto[] }>("/document-templates/scope-assignments", {
    params: { tenant_id: tenantId, scope_type: scopeType, scope_id: scopeId },
  });
  return data.items;
}

export async function upsertScopeAssignment(
  tenantId: number,
  payload: {
    kind_code: string;
    scope_type: string;
    scope_id: number;
    version_id: number | null;
    variant_code?: string;
  },
) {
  const { data } = await api.put<{ item: ScopeAssignmentDto | null }>("/document-templates/scope-assignments", payload, {
    params: { tenant_id: tenantId },
  });
  return data.item;
}

export async function fetchTemplateUsage(tenantId: number, templateId: number) {
  const { data } = await api.get<{
    badges: TemplateUsageBadge[];
    total: number;
    items: TemplateAssignmentItem[];
  }>(`/document-templates/templates/${templateId}/usage`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function fetchVersionReplaceImpact(tenantId: number, versionId: number) {
  const { data } = await api.get<{
    assignment_count: number;
    by_scope: Record<string, number>;
    items: TemplateAssignmentItem[];
  }>(`/document-templates/versions/${versionId}/replace-impact`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function replaceVersionAssignments(
  tenantId: number,
  fromVersionId: number,
  toVersionId: number,
  confirm: boolean,
) {
  const { data } = await api.post<{ updated_count: number }>(
    `/document-templates/versions/${fromVersionId}/replace-assignments`,
    { to_version_id: toVersionId, confirm },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function previewStarterDocumentPdf(
  tenantId: number,
  payload: {
    kind_code: string;
    twig_content: string;
    extends_version_id?: number | null;
    partial_pins_json?: string | null;
  },
) {
  const { data } = await api.post<Blob>(
    "/document-templates/preview/pdf",
    {
      kind_code: payload.kind_code,
      twig_content: payload.twig_content,
      context_mode: "sample",
      extends_version_id: payload.extends_version_id,
      partial_pins_json: payload.partial_pins_json,
    },
    { params: { tenant_id: tenantId }, responseType: "blob" },
  );
  return data;
}
