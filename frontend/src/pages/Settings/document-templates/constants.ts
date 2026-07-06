export const DOC_TEMPLATE_STATUS_LABELS: Record<string, string> = {
  draft: "Robocza",
  published: "Opublikowana",
  archived: "Archiwalna",
  publication_error: "Błąd publikacji",
  publish_failed: "Błąd publikacji",
};

export const DOC_TEMPLATE_SOURCE_LABELS: Record<string, string> = {
  SYSTEM: "Systemowy",
  STARTER: "Systemowy",
  MARKETPLACE: "Marketplace",
  TENANT: "Własny",
};

export const DOC_TEMPLATE_ROLE_LABELS: Record<string, string> = {
  BASE: "Szablon bazowy",
  DOCUMENT: "Dokument",
  PARTIAL: "Fragment",
};

export const DEFAULT_TENANT_ID = 1;

export const LIST_BASE = "/settings/document-templates";
