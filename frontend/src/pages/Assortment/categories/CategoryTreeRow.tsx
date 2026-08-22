import { ChevronRight, Folder, FolderOpen, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";

import type { ProductCategoryTreeNode } from "../../../api/productCategoriesApi";
import { OperationalActionButton, OperationalActionColumn } from "../../../components/operational";
import { StatusBadge } from "../../../design-system";

type Props = {
  node: ProductCategoryTreeNode;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  onAddChild: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Selection mode (product picker). */
  selectable?: boolean;
  selectedPrimaryId?: number | null;
  selectedAdditionalIds?: Set<number>;
  onSelectPrimary?: (id: number) => void;
  onToggleAdditional?: (id: number) => void;
};

/**
 * Single category tree row — DnD grip is present but inert until drag handlers are wired.
 */
export function CategoryTreeRow({
  node,
  depth,
  expanded,
  hasChildren,
  onToggle,
  onAddChild,
  onEdit,
  onDelete,
  selectable,
  selectedPrimaryId,
  selectedAdditionalIds,
  onSelectPrimary,
  onToggleAdditional,
}: Props) {
  const isPrimary = selectedPrimaryId === node.id;
  const isAdditional = selectedAdditionalIds?.has(node.id) ?? false;

  return (
    <div
      className={`group flex items-center gap-1 border-b border-slate-100 px-2 py-1.5 transition-colors hover:bg-slate-50/80 ${
        !node.is_active ? "opacity-55" : ""
      } ${isPrimary ? "bg-orange-50/70" : isAdditional ? "bg-sky-50/50" : ""}`}
      style={{ paddingLeft: 8 + depth * 18 }}
      data-category-id={node.id}
      data-dnd-ready="true"
    >
      <button
        type="button"
        className="inline-flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-slate-300 hover:text-slate-500 active:cursor-grabbing"
        title="Przeciągnij (wkrótce)"
        aria-label="Uchwyt przeciągania"
        draggable={false}
        onClick={(e) => e.preventDefault()}
      >
        <GripVertical className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>

      <button
        type="button"
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 ${
          hasChildren ? "" : "invisible"
        }`}
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={expanded ? "Zwiń" : "Rozwiń"}
      >
        <ChevronRight
          className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-amber-600">
        {expanded && hasChildren ? (
          <FolderOpen className="h-4 w-4" strokeWidth={2} aria-hidden />
        ) : (
          <Folder className="h-4 w-4" strokeWidth={2} aria-hidden />
        )}
      </span>

      <div className="min-w-0 flex-1">
        {selectable ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectPrimary?.(node.id)}
              className={`truncate text-left text-sm font-medium ${
                isPrimary ? "text-orange-800" : "text-slate-900 hover:text-orange-700"
              }`}
              title="Ustaw jako kategorię główną"
            >
              {node.name}
            </button>
            <button
              type="button"
              onClick={() => onToggleAdditional?.(node.id)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                isAdditional
                  ? "bg-sky-100 text-sky-800"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
              title="Dodaj / usuń kategorię dodatkową"
            >
              {isAdditional ? "Dodatkowa" : "+ Dodatkowa"}
            </button>
            {isPrimary ? (
              <StatusBadge tone="primary" density="compact">
                Główna
              </StatusBadge>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-900 hover:text-blue-700"
            onClick={onEdit}
            title="Otwórz kartę kategorii"
          >
            {node.name}
          </button>
        )}
        {!node.is_active ? (
          <div className="mt-0.5">
            <StatusBadge tone="neutral" density="compact">
              Nieaktywna
            </StatusBadge>
          </div>
        ) : null}
      </div>

      <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-slate-600">
        {node.product_count}
      </span>

      {!selectable ? (
        <OperationalActionColumn
          layout="stack"
          aria-label={`Akcje kategorii ${node.name}`}
          slots={[
            <OperationalActionButton
              key="add"
              title="Dodaj podkategorię"
              aria-label={`Dodaj podkategorię do ${node.name}`}
              onClick={onAddChild}
            >
              <Plus className="text-slate-600" strokeWidth={2} aria-hidden />
            </OperationalActionButton>,
            <OperationalActionButton
              key="edit"
              title="Edytuj"
              aria-label={`Edytuj ${node.name}`}
              onClick={onEdit}
            >
              <Pencil className="text-slate-600" strokeWidth={2} aria-hidden />
            </OperationalActionButton>,
            <OperationalActionButton
              key="del"
              variant="danger"
              title="Usuń"
              aria-label={`Usuń ${node.name}`}
              onClick={onDelete}
            >
              <Trash2 strokeWidth={2} aria-hidden />
            </OperationalActionButton>,
          ]}
        />
      ) : null}
    </div>
  );
}
