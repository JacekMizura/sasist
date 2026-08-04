import type { ReactNode } from "react";

export type DataTableColumnAlign = "left" | "center" | "right";

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  align?: DataTableColumnAlign;
  className?: string;
  headerClassName?: string;
  cell: (row: T, index: number) => ReactNode;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string | number;
  loading?: boolean;
  emptyMessage?: ReactNode;
  className?: string;
  /** Compact density for inline editors (product suppliers, etc.). */
  density?: "default" | "compact";
};

const alignClass: Record<DataTableColumnAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

/**
 * Shared SASIST data table shell — header + body rows.
 * Feature modules supply column renderers; do not invent one-off HTML tables.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  loading = false,
  emptyMessage = "Brak danych.",
  className = "",
  density = "default",
}: DataTableProps<T>) {
  const thPad = density === "compact" ? "pb-2 pr-3 last:pr-0" : "px-4 py-3";
  const tdPad = density === "compact" ? "py-3 pr-3 last:pr-0" : "px-4 py-3";
  const thBase =
    density === "compact"
      ? "text-xs font-medium text-slate-500"
      : "bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500";

  return (
    <div className={`overflow-x-auto ${className}`.trim()}>
      <table className="w-full whitespace-nowrap text-left text-sm">
        <thead>
          <tr className={density === "compact" ? "border-b border-slate-200" : "border-b border-slate-200"}>
            {columns.map((col) => (
              <th
                key={col.id}
                className={`${thPad} ${thBase} ${alignClass[col.align ?? "left"]} ${col.headerClassName ?? ""}`.trim()}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading && rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={`${tdPad} text-center text-slate-500`}>
                Wczytywanie…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={`${tdPad} text-center text-slate-500`}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={getRowKey(row, index)} className="transition-colors hover:bg-slate-50/80">
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={`${tdPad} text-slate-800 ${alignClass[col.align ?? "left"]} ${col.className ?? ""}`.trim()}
                  >
                    {col.cell(row, index)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
