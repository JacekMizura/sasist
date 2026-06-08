import type { InventoryExecutionSummary } from "../../../api/inventoryCountApi";
import { WMS_INV } from "../wmsIndustrialTheme";

type Props = {
  summary: InventoryExecutionSummary | null;
};

export default function WmsInventorySessionSummary({ summary }: Props) {
  if (!summary) return null;

  const remaining = summary.pending.length;
  const counted = summary.counted.length;
  const discrepancies = summary.variance.length;
  const extra = summary.unexpected.length + summary.variance.filter((v) => (v.difference_quantity ?? 0) > 0).length;

  return (
    <section className={`rounded-lg border ${WMS_INV.border} ${WMS_INV.surface} p-3`}>
      <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-[#5a6b7d]">Podsumowanie lokalizacji</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Policzone" value={counted} tone="text-[#1a7f4b]" />
        <Stat label="Pozostało" value={remaining} tone="text-[#5a6b7d]" />
        <Stat label="Różnice" value={discrepancies} tone="text-[#b42318]" />
        <Stat label="Nadwyżki / extra" value={extra} tone="text-[#b45309]" />
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-[#e8edf3] bg-[#fafbfc] px-3 py-2 text-center">
      <p className="text-[10px] font-black uppercase tracking-wider text-[#5a6b7d]">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
