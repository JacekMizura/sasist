import { useNavigate } from "react-router-dom";

import type { DocumentTemplateListItemDto } from "../../../api/documentTemplatesApi";
import {
  listSellasistTableBodyCellGrid,
  listSellasistTableHeaderCellGrid,
} from "../../../components/listPage/listSellasistTokens";
import { ModuleListRowActionsCell } from "../../../components/listPage/moduleList";
import {
  moduleListRowClass,
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTheadClass,
} from "../../../components/listPage/moduleList/moduleListTableTokens";
import { LIST_BASE } from "./constants";
import { DocumentTemplatesListRowActions } from "./DocumentTemplatesListRowActions";
import { documentTemplateListColumnLabel } from "./documentTemplatesListColumnCatalog";
import {
  documentTemplateAuthorName,
  documentTemplateKindSubtitle,
  documentTemplateListStatusPresentation,
  documentTemplateSourceBadgeClass,
  documentTemplateSourceLabel,
  documentTemplateStatusBadgeClass,
  documentTemplateUsedAsLabels,
  fmtDocumentTemplateDt,
  fmtDocumentTemplateLastEdited,
} from "./documentTemplatesListPresentation";

type Props = {
  rows: DocumentTemplateListItemDto[];
  columnOrder: string[];
  loading: boolean;
  onOpenUsage: (row: DocumentTemplateListItemDto) => void;
  onDuplicate: (row: DocumentTemplateListItemDto) => void;
  onExport: (row: DocumentTemplateListItemDto) => void;
  onDelete: (row: DocumentTemplateListItemDto) => void;
  onPublish: (row: DocumentTemplateListItemDto) => void;
};

export function DocumentTemplatesListTable({
  rows,
  columnOrder,
  loading,
  onOpenUsage,
  onDuplicate,
  onExport,
  onDelete,
  onPublish,
}: Props) {
  const navigate = useNavigate();
  const visibleColumns = columnOrder;
  const colSpan = visibleColumns.length + 1;

  const openEditor = (row: DocumentTemplateListItemDto) => {
    navigate(`${LIST_BASE}/${row.id}`);
  };

  const openHistory = (row: DocumentTemplateListItemDto) => {
    navigate(`${LIST_BASE}/${row.id}`, { state: { editorRightTab: "history" as const } });
  };

  return (
    <div className={moduleListTableScrollClass}>
      <table className={moduleListTableClass}>
        <thead className={moduleListTheadClass}>
          <tr>
            {visibleColumns.map((colId) => (
              <th key={colId} className={listSellasistTableHeaderCellGrid}>
                {documentTemplateListColumnLabel(colId)}
              </th>
            ))}
            <th className={`${listSellasistTableHeaderCellGrid} w-12 text-right`} aria-label="Akcje" />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={colSpan} className="py-12 text-center text-sm text-slate-500">
                Wczytywanie…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="py-12 text-center text-sm text-slate-500">
                Brak szablonów spełniających kryteria.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className={`${moduleListRowClass} group border-b border-slate-200/40`}
                onClick={() => openEditor(row)}
              >
                {visibleColumns.map((colId) => (
                  <td key={colId} className={listSellasistTableBodyCellGrid}>
                    <DocumentTemplateListCell
                      row={row}
                      columnId={colId}
                      onOpenUsage={onOpenUsage}
                    />
                  </td>
                ))}
                <ModuleListRowActionsCell ariaLabel={`Akcje szablonu ${row.name}`}>
                  <DocumentTemplatesListRowActions
                    row={row}
                    onEdit={openEditor}
                    onDuplicate={onDuplicate}
                    onHistory={openHistory}
                    onExport={onExport}
                    onDelete={onDelete}
                    onPublish={onPublish}
                  />
                </ModuleListRowActionsCell>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function DocumentTemplateListCell({
  row,
  columnId,
  onOpenUsage,
}: {
  row: DocumentTemplateListItemDto;
  columnId: string;
  onOpenUsage: (row: DocumentTemplateListItemDto) => void;
}) {
  switch (columnId) {
    case "name": {
      const sourceLabel = documentTemplateSourceLabel(row.source, row.source_label);
      return (
        <div className="min-w-0">
          <div className="font-medium text-slate-900">{row.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span>{documentTemplateKindSubtitle(row)}</span>
            <span aria-hidden>•</span>
            <span
              className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${documentTemplateSourceBadgeClass(row.source)}`}
            >
              {sourceLabel}
            </span>
          </div>
        </div>
      );
    }
    case "kind":
      return <span className="text-slate-700">{documentTemplateKindSubtitle(row)}</span>;
    case "family":
      return <span className="text-slate-700">{row.family?.name_pl ?? "—"}</span>;
    case "variant":
      return <span className="text-slate-700">{row.variants.join(", ") || "—"}</span>;
    case "status": {
      const status = documentTemplateListStatusPresentation(row);
      return (
        <div className="flex min-w-0 flex-col gap-1">
          <span
            className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${documentTemplateStatusBadgeClass(status.primaryStatus)}`}
          >
            {status.primaryLabel}
          </span>
          {status.showNewerDraft ? (
            <span className="text-xs font-medium text-amber-800">✏ Jest nowsza wersja robocza</span>
          ) : null}
        </div>
      );
    }
    case "used_as": {
      const labels = documentTemplateUsedAsLabels(row);
      if (labels.length === 0) return <span className="text-slate-400">—</span>;
      const [first, ...rest] = labels;
      const tooltip = labels.join("\n");
      return (
        <div className="min-w-0 max-w-[220px]" title={tooltip}>
          <div className="truncate text-slate-700">{first}</div>
          {rest.length > 0 ? (
            <div className="mt-0.5 text-xs font-medium text-slate-500">+{rest.length}</div>
          ) : null}
        </div>
      );
    }
    case "usage":
      return (row.usage_summary?.length ?? 0) > 0 ? (
        <button
          type="button"
          className="flex flex-wrap gap-1 text-left"
          onClick={(e) => {
            e.stopPropagation();
            onOpenUsage(row);
          }}
        >
          {row.usage_summary!.map((b) => (
            <span
              key={b.label}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
            >
              {b.label} ({b.count})
            </span>
          ))}
        </button>
      ) : (
        <span className="text-slate-400">—</span>
      );
    case "last_edited": {
      const editedAt = row.last_edited_at ?? row.updated_at;
      const editor = documentTemplateAuthorName(row.last_edited_by_name);
      if (!editedAt) return <span className="text-slate-400">—</span>;
      return (
        <div className="whitespace-nowrap text-slate-700">
          <div>{fmtDocumentTemplateLastEdited(editedAt)}</div>
          {editor ? <div className="mt-0.5 text-xs text-slate-500">{editor}</div> : null}
        </div>
      );
    }
    case "last_published":
      return <span className="whitespace-nowrap text-slate-700">{fmtDocumentTemplateDt(row.last_published_at)}</span>;
    case "author": {
      const author = documentTemplateAuthorName(row.author_name);
      return author ? <span className="text-slate-700">{author}</span> : <span className="text-slate-400">—</span>;
    }
    default:
      return null;
  }
}
