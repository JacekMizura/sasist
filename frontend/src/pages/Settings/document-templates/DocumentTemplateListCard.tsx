import { useEffect, useRef, useState } from "react";
import { FileText, MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { DocumentTemplateListItemDto } from "../../../api/documentTemplatesApi";
import { ListTile, SecondaryButton, StatusBadge } from "../../../design-system";
import { LIST_BASE } from "./constants";
import {
  documentTemplateKindSubtitle,
  documentTemplateListStatusPresentation,
  documentTemplateStatusTone,
  documentTemplateUsedAsLabels,
  fmtDocumentTemplateLastEdited,
} from "./documentTemplatesListPresentation";

type Props = {
  row: DocumentTemplateListItemDto;
  familyIcon?: string | null;
  onOpenUsage: (row: DocumentTemplateListItemDto) => void;
  onDuplicate: (row: DocumentTemplateListItemDto) => void;
  onExport: (row: DocumentTemplateListItemDto) => void;
  onDelete: (row: DocumentTemplateListItemDto) => void;
  onPublish: (row: DocumentTemplateListItemDto) => void;
};

/**
 * ERP list row — ListTile + StatusBadge (Produkcja / Zamówienia language).
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
    <ListTile density="comfortable" className="w-full">
      <div className="flex items-start gap-3 sm:gap-4">
        <button
          type="button"
          onClick={openEditor}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-lg transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40"
          aria-label={`Otwórz szablon ${row.name}`}
        >
          {icon ? <span aria-hidden>{icon}</span> : <FileText className="h-5 w-5 text-slate-400" aria-hidden />}
        </button>

        <div className="min-w-0 flex-1 space-y-2.5">
          <button type="button" onClick={openEditor} className="w-full min-w-0 text-left focus:outline-none">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-slate-900">{row.name}</h3>
              <StatusBadge tone={documentTemplateStatusTone(status.primaryStatus)} density="compact">
                {status.primaryLabel}
              </StatusBadge>
              {status.showNewerDraft ? (
                <StatusBadge tone="warning" density="compact">
                  Nowszy draft
                </StatusBadge>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-slate-600">{documentTemplateKindSubtitle(row)}</p>
          </button>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500">
            <span>
              <span className="text-slate-400">Używany jako:</span>{" "}
              <span className="font-medium text-slate-700" title={usedAs.join(", ") || undefined}>
                {usedAsText}
              </span>
            </span>
            <span>
              <span className="text-slate-400">Używane w:</span>{" "}
              <span className="font-medium text-slate-700" title={usedInText !== "—" ? usedInText : undefined}>
                {usedInText}
              </span>
            </span>
            <span>
              <span className="text-slate-400">Ostatnia edycja:</span>{" "}
              <span className="font-medium text-slate-700">{fmtDocumentTemplateLastEdited(editedAt)}</span>
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          <SecondaryButton type="button" density="compact" onClick={openEditor}>
            Edytuj
          </SecondaryButton>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label={`Akcje szablonu ${row.name}`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40"
            >
              <MoreVertical className="h-4 w-4" strokeWidth={2} />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
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
      </div>
    </ListTile>
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
