import type { DocumentTemplateListItemDto } from "../../../api/documentTemplatesApi";
import {
  DOC_TEMPLATE_SOURCE_LABELS,
  DOC_TEMPLATE_STATUS_LABELS,
} from "./constants";

export function documentTemplateStatusLabel(status: string, fallback?: string): string {
  return DOC_TEMPLATE_STATUS_LABELS[status] ?? fallback ?? status;
}

export function documentTemplateStatusBadgeClass(status: string): string {
  if (status === "published") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (status === "draft") return "bg-amber-50 text-amber-900 ring-amber-200";
  if (status === "archived") return "bg-slate-100 text-slate-600 ring-slate-200";
  if (status === "publication_error" || status === "publish_failed") {
    return "bg-red-50 text-red-800 ring-red-200";
  }
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

export function documentTemplateSourceLabel(source: string, fallback?: string): string {
  return DOC_TEMPLATE_SOURCE_LABELS[source] ?? fallback ?? source;
}

export function documentTemplateSourceBadgeClass(source: string): string {
  if (source === "TENANT") return "border-sky-200 bg-sky-50 text-sky-900";
  if (source === "STARTER" || source === "SYSTEM") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (source === "MARKETPLACE") return "border-indigo-200 bg-indigo-50 text-indigo-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function documentTemplateAuthorName(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return null;
  return trimmed;
}

export function fmtDocumentTemplateDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function fmtDocumentTemplateLastEdited(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = new Date();
    const time = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return `Dzisiaj ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Wczoraj ${time}`;
    return fmtDocumentTemplateDt(iso);
  } catch {
    return iso ?? "—";
  }
}

export function documentTemplateKindSubtitle(row: DocumentTemplateListItemDto): string {
  return row.kind?.name_pl ?? row.template_role_label;
}

export function documentTemplateListStatusPresentation(row: DocumentTemplateListItemDto): {
  primaryStatus: string;
  primaryLabel: string;
  showNewerDraft: boolean;
} {
  const hasPublished = Boolean(row.published_version);
  const hasDraft = Boolean(row.draft_version);
  if (hasPublished && hasDraft) {
    return {
      primaryStatus: "published",
      primaryLabel: documentTemplateStatusLabel("published"),
      showNewerDraft: true,
    };
  }
  if (hasDraft) {
    return {
      primaryStatus: "draft",
      primaryLabel: documentTemplateStatusLabel("draft"),
      showNewerDraft: false,
    };
  }
  if (hasPublished) {
    return {
      primaryStatus: "published",
      primaryLabel: documentTemplateStatusLabel("published"),
      showNewerDraft: false,
    };
  }
  return {
    primaryStatus: row.display_status || "archived",
    primaryLabel: documentTemplateStatusLabel(row.display_status, row.display_status_label),
    showNewerDraft: false,
  };
}

export function documentTemplateUsedAsLabels(row: DocumentTemplateListItemDto): string[] {
  if (row.used_as_labels?.length) return row.used_as_labels;
  if (!row.binding_summary?.trim()) return [];
  return row.binding_summary
    .split(",")
    .map((part) => part.trim().replace(/\s*\([^)]*\).*$/, "").trim())
    .filter(Boolean);
}
