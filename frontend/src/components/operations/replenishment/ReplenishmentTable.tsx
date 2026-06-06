import type { ReplenishmentRow } from "../../../utils/replenishmentRowModel";
import { ReplenishmentRowCells } from "./ReplenishmentRow";

const HEADERS = [
  "Priorytet",
  "Produkt",
  "Skąd",
  "Dokąd",
  "Brakuje",
  "Cel",
  "Status",
  "Operator",
  "SLA",
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
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            {HEADERS.map((h) => (
              <th key={h} className="px-2 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={HEADERS.length} className="px-4 py-8 text-sm text-slate-500">
                Ładowanie listy uzupełnień…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={HEADERS.length} className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">Brak aktywnych uzupełnień</p>
                <p className="mt-1 text-xs text-slate-500">
                  Magazyn nie wymaga obecnie uzupełnienia półek.
                </p>
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
