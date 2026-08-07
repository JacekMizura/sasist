import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical, Pencil, Trash2 } from "lucide-react";

import {
  adminListActionsCellClass,
  adminListActionsColWidth,
  adminListActionsInnerClass,
  adminListActionsThClass,
  adminListCheckboxClass,
  adminListDragHandleClass,
  adminListNameClass,
  adminListRowActionBtn,
  adminListRowActionBtnDanger,
  adminListRowClass,
  adminListRowInnerClass,
  adminListTableClass,
  adminListTdClass,
  adminListThClass,
  adminListThSortClass,
} from "./adminDataTableTokens";

export type AdminDataTableColumn<T> = {
  id: string;
  header: ReactNode;
  width?: string | number;
  className?: string;
  headerClassName?: string;
  /** Hide column below this breakpoint (Tailwind table-cell helpers). */
  hideBelow?: "sm" | "md" | "lg";
  cell: (row: T, index: number) => ReactNode;
};

export type AdminDataTableProps<T> = {
  rows: T[];
  getRowId: (row: T) => number;
  getRowName: (row: T) => string;
  columns: AdminDataTableColumn<T>[];
  selectedIds: Set<number>;
  onSelect: (id: number, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  nameHeader?: string;
  nameWidth?: string | number;
  onNameClick?: (row: T) => void;
  editTo?: (row: T) => string;
  onDelete?: (row: T) => void;
  reorderEnabled?: boolean;
  reorderBusy?: boolean;
  idSort?: "asc" | "desc";
  onIdSortChange?: (dir: "asc" | "desc") => void;
  /** Optional mobile cards (md:hidden). */
  renderMobileCard?: (row: T, ctx: AdminMobileCardCtx<T>) => ReactNode;
  minWidthClass?: string;
};

export type AdminMobileCardCtx<T> = {
  selected: boolean;
  onSelect: (id: number, checked: boolean) => void;
  onDelete?: (row: T) => void;
  reorderBusy: boolean;
};

const hideTh: Record<"sm" | "md" | "lg", string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

const hideCol: Record<"sm" | "md" | "lg", string> = {
  sm: "hidden sm:table-column",
  md: "hidden md:table-column",
  lg: "hidden lg:table-column",
};

type RowProps<T> = {
  row: T;
  index: number;
  selected: boolean;
  getRowId: (row: T) => number;
  getRowName: (row: T) => string;
  columns: AdminDataTableColumn<T>[];
  onSelect: (id: number, checked: boolean) => void;
  onNameClick?: (row: T) => void;
  editTo?: (row: T) => string;
  onDelete?: (row: T) => void;
  reorderEnabled: boolean;
  reorderBusy: boolean;
  nameWidth?: string | number;
};

function AdminSortableRow<T>({
  row,
  index,
  selected,
  getRowId,
  getRowName,
  columns,
  onSelect,
  onNameClick,
  editTo,
  onDelete,
  reorderEnabled,
  reorderBusy,
  nameWidth = "22%",
}: RowProps<T>) {
  const navigate = useNavigate();
  const id = getRowId(row);
  const name = getRowName(row);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !reorderEnabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
    zIndex: isDragging ? 2 : undefined,
  };
  const href = editTo?.(row);

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`${adminListRowClass} ${selected ? "bg-sky-50/40 hover:bg-sky-50/50" : ""}`}
      data-zebra={index % 2 === 0 ? "even" : "odd"}
    >
      <td className={`${adminListTdClass} w-10`}>
        <div className={adminListRowInnerClass}>
          {reorderEnabled ? (
            <button
              type="button"
              className={adminListDragHandleClass}
              title="Przeciągnij, aby zmienić kolejność"
              aria-label={`Zmień kolejność: ${name}`}
              disabled={reorderBusy}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          ) : (
            <span className="inline-block h-9 w-9" aria-hidden />
          )}
        </div>
      </td>
      <td className={`${adminListTdClass} w-10 text-center`}>
        <div className={adminListRowInnerClass}>
          <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              className={adminListCheckboxClass}
              checked={selected}
              onChange={(e) => onSelect(id, e.target.checked)}
              aria-label={`Zaznacz ${name}`}
            />
          </label>
        </div>
      </td>
      <td
        className={`${adminListTdClass} font-mono text-sm font-semibold tabular-nums text-slate-600`}
        style={{ width: 72 }}
      >
        <div className={adminListRowInnerClass}>{id}</div>
      </td>
      <td className={adminListTdClass} style={{ width: nameWidth }}>
        <div className={adminListRowInnerClass}>
          {onNameClick || href ? (
            <button
              type="button"
              className={adminListNameClass}
              title={name}
              onClick={() => {
                if (onNameClick) onNameClick(row);
                else if (href) navigate(href);
              }}
            >
              {name}
            </button>
          ) : (
            <span className={adminListNameClass} title={name}>
              {name}
            </span>
          )}
        </div>
      </td>
      {columns.map((col) => (
        <td
          key={col.id}
          className={`${adminListTdClass} ${col.hideBelow ? hideTh[col.hideBelow] : ""}`}
          style={col.width != null ? { width: col.width } : undefined}
        >
          <div className={`${adminListRowInnerClass} ${col.className ?? ""}`}>{col.cell(row, index)}</div>
        </td>
      ))}
      <td className={adminListActionsCellClass} style={{ width: adminListActionsColWidth }}>
        <div className={adminListActionsInnerClass}>
          {href ? (
            <Link to={href} className={adminListRowActionBtn} title="Edytuj" aria-label="Edytuj">
              <Pencil className="h-4 w-4 shrink-0" strokeWidth={2} />
            </Link>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className={adminListRowActionBtnDanger}
              title="Usuń"
              aria-label="Usuń"
              disabled={reorderBusy}
              onClick={() => onDelete(row)}
            >
              <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2} />
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

/**
 * Shared admin list table: drag · checkbox · ID · name · custom columns · icon actions.
 * Wrap with DndContext / SortableContext when reorder is enabled.
 */
export function AdminDataTable<T>({
  rows,
  getRowId,
  getRowName,
  columns,
  selectedIds,
  onSelect,
  onSelectAll,
  allVisibleSelected,
  someVisibleSelected,
  nameHeader = "Nazwa",
  nameWidth = "22%",
  onNameClick,
  editTo,
  onDelete,
  reorderEnabled = false,
  reorderBusy = false,
  idSort = "asc",
  onIdSortChange,
  renderMobileCard,
  minWidthClass,
}: AdminDataTableProps<T>) {
  const tableClass = minWidthClass
    ? adminListTableClass.replace("min-w-[960px]", minWidthClass)
    : adminListTableClass;

  return (
    <>
      <div className={renderMobileCard ? "hidden overflow-x-auto md:block" : "overflow-x-auto"}>
        <table className={tableClass}>
          <colgroup>
            <col className="w-10" />
            <col className="w-10" />
            <col style={{ width: 72 }} />
            <col style={{ width: nameWidth }} />
            {columns.map((col) => (
              <col
                key={col.id}
                className={col.hideBelow ? hideCol[col.hideBelow] : undefined}
                style={col.width != null ? { width: col.width } : undefined}
              />
            ))}
            <col style={{ width: adminListActionsColWidth }} />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 bg-white">
              <th className={adminListThClass} aria-label="Kolejność" />
              <th className={adminListThClass}>
                <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    className={adminListCheckboxClass}
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                    }}
                    onChange={(e) => onSelectAll(e.target.checked)}
                    aria-label="Zaznacz wszystkie"
                  />
                </label>
              </th>
              <th className={onIdSortChange ? adminListThSortClass : adminListThClass}>
                {onIdSortChange ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() => onIdSortChange(idSort === "asc" ? "desc" : "asc")}
                  >
                    ID
                    {idSort === "asc" ? (
                      <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    )}
                  </button>
                ) : (
                  "ID"
                )}
              </th>
              <th className={adminListThClass}>{nameHeader}</th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={`${adminListThClass} ${col.hideBelow ? hideTh[col.hideBelow] : ""} ${col.headerClassName ?? ""}`}
                  style={col.width != null ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
              <th className={adminListActionsThClass} style={{ width: adminListActionsColWidth }}>
                Akcje
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <AdminSortableRow
                key={getRowId(row)}
                row={row}
                index={index}
                selected={selectedIds.has(getRowId(row))}
                getRowId={getRowId}
                getRowName={getRowName}
                columns={columns}
                onSelect={onSelect}
                onNameClick={onNameClick}
                editTo={editTo}
                onDelete={onDelete}
                reorderEnabled={reorderEnabled}
                reorderBusy={reorderBusy}
                nameWidth={nameWidth}
              />
            ))}
          </tbody>
        </table>
      </div>

      {renderMobileCard ? (
        <div className="space-y-3 md:hidden">
          {rows.map((row) =>
            renderMobileCard(row, {
              selected: selectedIds.has(getRowId(row)),
              onSelect,
              onDelete,
              reorderBusy,
            }),
          )}
        </div>
      ) : null}
    </>
  );
}

export function adminDataTableSortableIds<T>(rows: T[], getRowId: (row: T) => number): number[] {
  return rows.map(getRowId);
}
