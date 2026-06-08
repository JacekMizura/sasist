import type { InventoryExecutionLine } from "@/api/inventoryCountApi";
import { WMS_INV } from "../wmsIndustrialTheme";

type Props = {
  pending: InventoryExecutionLine[];
  counted: InventoryExecutionLine[];
  variance: InventoryExecutionLine[];
  unexpected: InventoryExecutionLine[];
  onSelectLine?: (lineId: number) => void;
};

function Chip({
  line,
  tone,
  onClick,
}: {
  line: InventoryExecutionLine;
  tone: "pending" | "counted" | "variance" | "unexpected";
  onClick?: () => void;
}) {
  const label = line.product_name ?? line.sku ?? `#${line.product_id ?? line.unknown_id}`;
  const qty =
    line.counted_quantity != null
      ? String(line.counted_quantity)
      : line.quantity != null
        ? String(line.quantity)
        : "";
  const toneClass =
    tone === "variance"
      ? WMS_INV.critical
      : tone === "unexpected"
        ? WMS_INV.warning
        : tone === "counted"
          ? WMS_INV.successSoft
          : `border-[#c5d0de] bg-white text-[#1a2b3c]`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex max-w-full items-center gap-2 rounded-lg border-2 px-2.5 py-1.5 text-left text-xs font-bold ${toneClass}`}
    >
      <span className="truncate">{label}</span>
      {qty ? <span className="shrink-0 tabular-nums opacity-80">{qty}</span> : null}
    </button>
  );
}

export default function WmsInventoryProductChipList({
  pending,
  counted,
  variance,
  unexpected,
  onSelectLine,
}: Props) {
  return (
    <div className="space-y-3">
      {variance.length > 0 ? (
        <section>
          <h3 className="mb-1.5 text-xs font-black uppercase tracking-wider text-[#b42318]">Różnice</h3>
          <div className="flex flex-wrap gap-1.5">
            {variance.map((ln) => (
              <Chip
                key={ln.line_id ?? ln.unknown_id}
                line={ln}
                tone="variance"
                onClick={ln.line_id ? () => onSelectLine?.(ln.line_id!) : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}
      {unexpected.length > 0 ? (
        <section>
          <h3 className="mb-1.5 text-xs font-black uppercase tracking-wider text-[#b45309]">Nieoczekiwane</h3>
          <div className="flex flex-wrap gap-1.5">
            {unexpected.map((ln) => (
              <Chip key={ln.unknown_id ?? ln.line_id} line={ln} tone="unexpected" />
            ))}
          </div>
        </section>
      ) : null}
      {pending.length > 0 ? (
        <section>
          <h3 className="mb-1.5 text-xs font-black uppercase tracking-wider text-[#5a6b7d]">Do policzenia</h3>
          <div className="flex flex-wrap gap-1.5">
            {pending.map((ln) => (
              <Chip
                key={ln.line_id}
                line={ln}
                tone="pending"
                onClick={() => onSelectLine?.(ln.line_id!)}
              />
            ))}
          </div>
        </section>
      ) : null}
      {counted.length > 0 ? (
        <section>
          <h3 className="mb-1.5 text-xs font-black uppercase tracking-wider text-[#1a7f4b]">Policzone</h3>
          <div className="flex flex-wrap gap-1.5">
            {counted.slice(0, 40).map((ln) => (
              <Chip
                key={ln.line_id}
                line={ln}
                tone="counted"
                onClick={() => onSelectLine?.(ln.line_id!)}
              />
            ))}
            {counted.length > 40 ? (
              <span className="self-center text-xs text-[#5a6b7d]">+{counted.length - 40}</span>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
