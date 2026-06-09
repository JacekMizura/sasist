import { Image as ImageIcon } from "lucide-react";

import type { WmsCountedProduct } from "../../wmsInventoryExecutionContext";
import { inventoryTotalPieces } from "./inventoryQtyUtils";
import type { InventoryQtyEditState } from "./inventoryQtyUtils";

type Props = {
  items: WmsCountedProduct[];
  activeLineId: number | null;
  unitsPerCarton?: number;
  onSelect?: (item: WmsCountedProduct) => void;
};

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(n);
}

function shortName(name: string | null | undefined): string {
  const t = (name ?? "—").trim();
  if (t.length <= 28) return t;
  return `${t.slice(0, 25)}…`;
}

/** Last 1–2 products counted by this operator — not full location list. */
export default function WmsInventoryOperatorRecent({ items, activeLineId, onSelect }: Props) {
  const visible = items.filter((item) => item.line_id !== activeLineId).slice(0, 2);
  if (visible.length === 0) return null;

  return (
    <section className="space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        Ostatnio policzone przeze mnie
      </p>
      <ul className="space-y-1">
        {visible.map((item) => (
          <li key={item.line_id}>
            <button
              type="button"
              onClick={() => onSelect?.(item)}
              className="flex w-full items-center gap-3 py-2 text-left active:bg-slate-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt=""
                    className="max-h-full max-w-full object-contain mix-blend-multiply"
                    loading="lazy"
                  />
                ) : (
                  <ImageIcon size={20} className="text-slate-200" strokeWidth={1.5} />
                )}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">
                {shortName(item.product_name ?? item.sku)}
              </span>
              <span className="shrink-0 text-base font-black tabular-nums text-slate-900">
                {fmtQty(item.counted_quantity)} szt.
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function formatOperatorQtySummary(qtyState: InventoryQtyEditState, pack: number): string {
  const total = inventoryTotalPieces(qtyState, pack);
  return `${fmtQty(total)} szt.`;
}
