import { FileText, MoreVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { DocumentTemplateListItemDto } from "../../../api/documentTemplatesApi";
import { StatusBadge } from "../../../design-system/components";
import { LIST_BASE } from "./constants";
import {
  documentTemplateKindSubtitle,
  documentTemplateListStatusPresentation,
  documentTemplateStatusTone,
  documentTemplateUsedAsLabels,
  fmtDocumentTemplateLastEdited,
} from "./documentTemplatesListPresentation";

/** Uniform list thumbnail — identical size/margins across all cards. */
const THUMB_CLASS =
  "flex h-16 w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#E5E7EB] bg-slate-50 text-2xl transition hover:border-orange-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2";

const outlineActionClass =
  "rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-orange-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2";

type Props = {
  row: DocumentTemplateListItemDto;
  /** Catalog family icon (emoji) — not on list DTO; resolved by parent. */
  familyIcon?: string | null;
  onOpenUsage: (row: DocumentTemplateListItemDto) => void;
  onDuplicate: (row: DocumentTemplateListItemDto) => void;
  onExport: (row: DocumentTemplateListItemDto) => void;
  onDelete: (row: DocumentTemplateListItemDto) => void;
  onPublish: (row: DocumentTemplateListItemDto) => void;
};

/**
 * List card — scan hierarchy + calm actions (primary + overflow).
 */
export function DocumentTemplateListCard({
  row,
  familyIcon,
  onOpenUsage,
  onDuplicate,
  onExport,
  onDelete,
  onPublish,
}: Props) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const status = documentTemplateListStatusPresentation(row);
  const usedAs = documentTemplateUsedAsLabels(row);
  const usage = row.usage_summary ?? [];
  const icon = familyIcon?.trim() || null;
  const editedAt = row.last_edited_at ?? row.updated_at;

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const openEditor = () => navigate(`${LIST_BASE}/${row.id}`);
  const openHistory = () =>
    navigate(`${LIST_BASE}/${row.id}`, { state: { editorRightTab: "history" as const } });

  const usedAsText =
    usedAs.length > 0
      ? `${usedAs.slice(0, 3).join(", ")}${usedAs.length > 3 ? ` +${usedAs.length - 3}` : ""}`
      : "—";
  const usedInText =
    usage.length > 0
      ? usage
          .slice(0, 3)
          .map((b) => `${b.label} (${b.count})`)
          .join(", ") + (usage.length > 3 ? ` +${usage.length - 3}` : "")
      : "—";

  return (
    <article
      className={[
        "group flex w-full items-start gap-4 border border-[#E5E7EB] bg-white px-4 py-3.5 shadow-sm transition",
        "hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md",
      ].join(" ")}
      style={{ borderRadius: 16 }}
    >
      <button type="button" onClick={openEditor} className={THUMB_CLASS} aria-label={`Otwórz szablon ${row.name}`}>
        {icon ? <span aria-hidden>{icon}</span> : <FileText className="h-7 w-7 text-slate-400" aria-hidden />}
      </button>

      <div className="min-w-0 flex-1">
        <button type="button" onClick={openEditor} className="w-full min-w-0 text-left focus:outline-none">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold tracking-tight text-slate-900">{row.name}</h3>
            <StatusBadge tone={documentTemplateStatusTone(status.primaryStatus)} density="compact">
              {status.primaryLabel}
            </StatusBadge>
            {status.showNewerDraft ? (
              <StatusBadge tone="warning" density="compact">
                Nowszy draft
              </StatusBadge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-600">{documentTemplateKindSubtitle(row)}</p>
        </button>

        <dl className="mt-2.5 space-y-1 text-xs leading-snug text-slate-500">
          <div className="flex min-w-0 gap-2">
            <dt className="w-[6.5rem] shrink-0 text-slate-400">Używany jako</dt>
            <dd className="min-w-0 truncate text-slate-600" title={usedAs.join(", ") || undefined}>
              {usedAsText}
            </dd>
          </div>
          <div className="flex min-w-0 gap-2">
            <dt className="w-[6.5rem] shrink-0 text-slate-400">Używane w</dt>
            <dd className="min-w-0 truncate text-slate-600" title={usedInText !== "—" ? usedInText : undefined}>
              {usedInText}
            </dd>
          </div>
          <div className="flex min-w-0 gap-2">
            <dt className="w-[6.5rem] shrink-0 text-slate-400">Ostatnia edycja</dt>
            <dd className="min-w-0 truncate text-slate-500">{fmtDocumentTemplateLastEdited(editedAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
        <button type="button" onClick={openEditor} className={outlineActionClass}>
          Edytuj
        </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label={`Więcej akcji: ${row.name}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-slate-600 shadow-sm transition hover:border-orange-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
          >
            <MoreVertical className="h-4 w-4" strokeWidth={2} />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
            >
              {row.draft_version ? (
                <MenuItem
                  label="Publikuj"
                  onClick={() => {
                    setMenuOpen(false);
                    onPublish(row);
                  }}
                />
              ) : null}
              <MenuItem
                label="Duplikuj"
                onClick={() => {
                  setMenuOpen(false);
                  onDuplicate(row);
                }}
              />
              <MenuItem
                label="Gdzie używany"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenUsage(row);
                }}
              />
              <MenuItem
                label="Historia wersji"
                onClick={() => {
                  setMenuOpen(false);
                  openHistory();
                }}
              />
              <MenuItem
                label="Eksport"
                onClick={() => {
                  setMenuOpen(false);
                  onExport(row);
                }}
              />
              {row.can_delete ? (
                <MenuItem
                  label="Usuń"
                  danger
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(row);
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={[
        "block w-full px-3 py-2 text-left text-sm transition hover:bg-orange-50 focus:outline-none focus-visible:bg-orange-50",
        danger ? "font-medium text-red-600" : "text-slate-700",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
