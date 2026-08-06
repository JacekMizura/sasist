import { useEffect, useRef, useState } from "react";
import { ChevronRight, Folder, FolderOpen, GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

import type { ProductCategoryTreeNode } from "../../../api/productCategoriesApi";
import { IconButton } from "../../../design-system";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isPrimary = selectedPrimaryId === node.id;
  const isAdditional = selectedAdditionalIds?.has(node.id) ?? false;

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

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
              <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-800">
                Główna
              </span>
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
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Nieaktywna</div>
        ) : null}
      </div>

      <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-slate-600">
        {node.product_count}
      </span>

      {!selectable ? (
        <div className="relative shrink-0" ref={menuRef}>
          <IconButton
            type="button"
            density="compact"
            title="Więcej"
            onClick={() => setMenuOpen((o) => !o)}
            className="opacity-70 group-hover:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
          </IconButton>
          {menuOpen ? (
            <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setMenuOpen(false);
                  onAddChild();
                }}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Dodaj podkategorię
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Edytuj
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Usuń
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
