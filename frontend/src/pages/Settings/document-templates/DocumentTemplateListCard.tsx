import { FileText, MoreVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { DocumentTemplateListItemDto } from "../../../api/documentTemplatesApi";
import { LIST_BASE } from "./constants";
import {
  documentTemplateKindSubtitle,
  documentTemplateListStatusPresentation,
  documentTemplateSourceLabel,
  documentTemplateStatusBadgeClass,
  documentTemplateUsedAsLabels,
  fmtDocumentTemplateLastEdited,
} from "./documentTemplatesListPresentation";

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
 * List card aligned with Label System TemplateListRow language (no ERP table).
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
  const icon = familyIcon?.trim() || null;

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

  return (
    <article
      className={[
        "group flex w-full items-center gap-4 border bg-white px-4 py-3.5 shadow-sm transition",
        "hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md",
        "border-[#E5E7EB]",
      ].join(" ")}
      style={{ borderRadius: 16 }}
    >
      <button
        type="button"
        onClick={openEditor}
        className="flex h-[72px] w-[112px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#E5E7EB] bg-slate-50 text-2xl transition hover:border-orange-300"
        aria-label={`Otwórz szablon ${row.name}`}
      >
        {icon ? <span aria-hidden>{icon}</span> : <FileText className="h-8 w-8 text-slate-400" aria-hidden />}
      </button>

      <button type="button" onClick={openEditor} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-slate-900">{row.name}</h3>
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${documentTemplateStatusBadgeClass(status.primaryStatus)}`}
          >
            {status.primaryLabel}
          </span>
          {status.showNewerDraft ? (
            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-200">
              Nowszy draft
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {documentTemplateKindSubtitle(row)}
          {" · "}
          {documentTemplateSourceLabel(row.source, row.source)}
          {" · "}
          {fmtDocumentTemplateLastEdited(row.updated_at)}
        </p>
        {usedAs.length > 0 ? (
          <p className="mt-1.5 line-clamp-1 text-xs text-slate-400">
            Używane: {usedAs.slice(0, 4).join(", ")}
            {usedAs.length > 4 ? ` +${usedAs.length - 4}` : ""}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-slate-400">Brak aktywnych powiązań</p>
        )}
      </button>

      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          aria-label={`Akcje szablonu ${row.name}`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-slate-600 shadow-sm transition hover:border-orange-300 hover:shadow-md"
        >
          <MoreVertical className="h-4 w-4" strokeWidth={2} />
        </button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
          >
            <MenuItem
              label="Edytuj"
              onClick={() => {
                setMenuOpen(false);
                openEditor();
              }}
            />
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
            {row.draft_version ? (
              <MenuItem
                label="Publikuj"
                onClick={() => {
                  setMenuOpen(false);
                  onPublish(row);
                }}
              />
            ) : null}
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
        "block w-full px-3 py-2 text-left text-sm transition hover:bg-orange-50",
        danger ? "font-medium text-red-600" : "text-slate-700",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
