import type { ReplenishmentRow as Row } from "../../../utils/replenishmentRowModel";

type Props = {
  row: Row;
  onAssign: () => void;
  onStart: () => void;
  onExecute: () => void;
  onBlock: () => void;
  onEscalate: () => void;
  onOpenStock: () => void;
};

export function ReplenishmentRowActions({
  onAssign,
  onStart,
  onExecute,
  onBlock,
  onEscalate,
  onOpenStock,
}: Omit<Props, "row">) {
  return (
    <div className="flex flex-wrap gap-1">
      {(
        [
          ["Przypisz", onAssign],
          ["Rozpocznij", onStart],
          ["Wykonaj", onExecute],
          ["Zablokuj", onBlock],
          ["Eskaluj", onEscalate],
          ["Szczegóły", onOpenStock],
        ] as const
      ).map(([label, fn]) => (
        <button
          key={label}
          type="button"
          onClick={fn}
          className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-medium hover:bg-slate-100"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function ReplenishmentRowCells({ row, ...actions }: Props) {
  const sla = row.slaDue
    ? new Date(row.slaDue).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })
    : "—";
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/80">
      <td className="px-2 py-2 text-xs tabular-nums">
        <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-900">
          P{row.priority}
        </span>
      </td>
      <td className="max-w-[160px] px-2 py-2">
        <div className="truncate text-xs font-medium text-slate-900">{row.productName}</div>
        <div className="truncate text-[10px] text-slate-500">{row.skuEan}</div>
      </td>
      <td className="max-w-[100px] truncate px-2 py-2 text-xs text-slate-700">{row.sourceLocation}</td>
      <td className="max-w-[100px] truncate px-2 py-2 text-xs text-slate-700">{row.targetLocation}</td>
      <td className="px-2 py-2 text-xs font-semibold tabular-nums text-red-700">{row.suggestedQty}</td>
      <td className="px-2 py-2 text-xs tabular-nums text-slate-600">{row.targetQty}</td>
      <td className="px-2 py-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
          {row.taskStatus}
        </span>
      </td>
      <td className="px-2 py-2 text-xs text-slate-600">
        {row.assignedOperatorId ? `#${row.assignedOperatorId}` : "—"}
      </td>
      <td className="px-2 py-2 text-xs tabular-nums text-slate-500">{sla}</td>
      <td className="px-2 py-2">
        <ReplenishmentRowActions {...actions} />
      </td>
    </tr>
  );
}
