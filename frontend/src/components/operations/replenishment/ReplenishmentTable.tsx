import type { ReplenishmentRow } from "../../../utils/replenishmentRowModel";
import { ReplenishmentRowCells } from "./ReplenishmentRow";

const HEADERS = [
  "P",
  "Produkt",
  "SKU/EAN",
  "Źr. strefa",
  "Źr. lok.",
  "Cel strefa",
  "Cel lok.",
  "Stan",
  "Cel",
  "Sug.",
  "Status",
  "Operator",
  "SLA",
  "Wiek",
  "Akcje",
] as const;

type Props = {
  rows: ReplenishmentRow[];
  loading?: boolean;
  onAssign: (row: ReplenishmentRow) => void;
  onStart: (row: ReplenishmentRow) => void;
  onExecute: (row: ReplenishmentRow) => void;
  onBlock: (row: ReplenishmentRow) => void;
  onEscalate: (row: ReplenishmentRow) => void;
  onOpenStock: (row: ReplenishmentRow) => void;
};

export function ReplenishmentTable({
  rows,
  loading,
  onAssign,
  onStart,
  onExecute,
  onBlock,
  onEscalate,
  onOpenStock,
}: Props) {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded border border-slate-200 bg-white">
      <table className="w-full min-w-[1100px] border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] font-semibold uppercase text-slate-600">
          <tr>
            {HEADERS.map((h) => (
              <th key={h} className="px-1 py-1.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={HEADERS.length} className="px-3 py-6 text-sm text-slate-400">
                Ładowanie…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={HEADERS.length} className="px-3 py-6 text-sm text-slate-400">
                Brak zadań uzupełnienia.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <ReplenishmentRowCells
                key={row.taskId}
                row={row}
                onAssign={() => onAssign(row)}
                onStart={() => onStart(row)}
                onExecute={() => onExecute(row)}
                onBlock={() => onBlock(row)}
                onEscalate={() => onEscalate(row)}
                onOpenStock={() => onOpenStock(row)}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
