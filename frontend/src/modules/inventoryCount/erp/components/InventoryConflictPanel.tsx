import type { InventoryConflictItem } from "@/api/inventoryCountApi";
import { inventoryRecountStateLabel } from "../../inventoryCountUiLabels";
import { inventoryStockSourceLabel } from "../../inventoryStockSourceLabel";
import { InventorySection } from "./InventoryPageShell";

type Props = {
  items: InventoryConflictItem[];
  loading?: boolean;
};

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function InventoryConflictPanel({ items, loading }: Props) {
  if (loading) return <p className="px-3 py-4 text-xs text-slate-500">Wczytywanie konfliktów…</p>;

  if (items.length === 0) {
    return (
      <InventorySection title="Konflikty liczenia">
        <p className="px-3 py-4 text-xs text-slate-500">Brak konfliktów operatorów — różnice stanów to nie to samo.</p>
      </InventorySection>
    );
  }

  return (
    <InventorySection title={`Konflikty liczenia (${items.length})`}>
      <div className="divide-y divide-slate-100">
        {items.map((c) => {
          const src = inventoryStockSourceLabel(c);
          const rsLabel = inventoryRecountStateLabel(c.recount_state);
          return (
            <div key={c.line_id} className="px-3 py-2 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">{c.product_name ?? c.sku ?? `#${c.product_id}`}</p>
                  <p className="text-slate-600">
                    {c.location_name} · <span className="font-medium">{src.label}</span>
                    {c.carrier_code ? ` (${c.carrier_code})` : null}
                  </p>
                </div>
                {rsLabel ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">{rsLabel}</span>
                ) : null}
              </div>
              <table className="mt-2 w-full text-[11px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-slate-400">
                    <th className="pb-1">Operator</th>
                    <th className="pb-1 text-right">Ilość</th>
                    <th className="pb-1 text-right">Czas</th>
                  </tr>
                </thead>
                <tbody>
                  {c.operators.map((op, i) => (
                    <tr key={`${op.user_id}-${i}`} className="border-t border-slate-50">
                      <td className="py-1 font-medium">{op.operator_name}</td>
                      <td className="py-1 text-right tabular-nums font-bold">{op.quantity}</td>
                      <td className="py-1 text-right tabular-nums text-slate-500">{fmtTime(op.counted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </InventorySection>
  );
}
