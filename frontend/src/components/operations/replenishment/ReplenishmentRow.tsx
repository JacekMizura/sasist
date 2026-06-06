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
    <div className="flex flex-wrap gap-0.5">
      {(
        [
          ["Przypisz", onAssign],
          ["Start", onStart],
          ["Wykonaj", onExecute],
          ["Blok", onBlock],
          ["Eskaluj", onEscalate],
          ["Stan", onOpenStock],
        ] as const
      ).map(([label, fn]) => (
        <button
          key={label}
          type="button"
          onClick={fn}
          className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] hover:bg-slate-100"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function ReplenishmentRowCells({ row, ...actions }: Props) {
  const sla = row.slaDue ? new Date(row.slaDue).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : "—";
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/80">
      <td className="px-1 py-1 text-xs tabular-nums">P{row.priority}</td>
      <td className="max-w-[140px] truncate px-1 py-1 text-xs font-medium">{row.productName}</td>
      <td className="max-w-[100px] truncate px-1 py-1 text-[10px] text-slate-500">{row.skuEan}</td>
      <td className="px-1 py-1 text-[10px]">{row.sourceZone}</td>
      <td className="max-w-[80px] truncate px-1 py-1 text-[10px]">{row.sourceLocation}</td>
      <td className="px-1 py-1 text-[10px]">{row.targetZone}</td>
      <td className="max-w-[80px] truncate px-1 py-1 text-[10px]">{row.targetLocation}</td>
      <td className="px-1 py-1 text-xs tabular-nums">{row.currentQty}</td>
      <td className="px-1 py-1 text-xs tabular-nums">{row.targetQty}</td>
      <td className="px-1 py-1 text-xs font-semibold tabular-nums">{row.suggestedQty}</td>
      <td className="px-1 py-1 text-[10px] uppercase">{row.taskStatus}</td>
      <td className="px-1 py-1 text-[10px] tabular-nums">{row.assignedOperatorId ?? "—"}</td>
      <td className="px-1 py-1 text-[10px] tabular-nums">{sla}</td>
      <td className="px-1 py-1 text-[10px] text-slate-500">{row.ageLabel}</td>
      <td className="px-1 py-1">
        <ReplenishmentRowActions {...actions} />
      </td>
    </tr>
  );
}
