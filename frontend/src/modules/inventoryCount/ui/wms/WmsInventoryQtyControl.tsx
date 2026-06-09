import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

import type { WmsQtyInputMode } from "@/modules/inventoryCount/wmsInventoryExecutionContext";

type Props = {
  quantityPieces: number;
  mode: WmsQtyInputMode;
  unitsPerCarton: number;
  disabled?: boolean;
  onAdjust: (delta: number) => void;
  onSetQuantity: (qty: number) => void;
};

export default function WmsInventoryQtyControl({
  quantityPieces,
  mode,
  unitsPerCarton,
  disabled,
  onAdjust,
  onSetQuantity,
}: Props) {
  const pack = Math.max(1, unitsPerCarton);
  const displayQty = mode === "carton" ? quantityPieces / pack : quantityPieces;
  const unitLabel = mode === "carton" ? "krt." : "szt.";
  const [draft, setDraft] = useState(String(displayQty));

  useEffect(() => {
    setDraft(Number.isInteger(displayQty) ? String(displayQty) : displayQty.toFixed(2).replace(/\.?0+$/, ""));
  }, [displayQty]);

  const commitDraft = () => {
    const parsed = Number.parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(parsed)) {
      setDraft(String(displayQty));
      return;
    }
    onSetQuantity(Math.max(0, parsed));
  };

  return (
    <div>
      <div className="mb-8 flex items-center justify-center gap-10">
        <button
          type="button"
          disabled={disabled}
          className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-100 text-slate-400 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-600 disabled:opacity-40"
          onClick={() => onAdjust(-1)}
          aria-label="Zmniejsz"
        >
          <Minus className="h-7 w-7" />
        </button>

        <div className="flex min-w-[120px] items-baseline justify-center gap-2 border-r border-slate-100 pr-6">
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, ""))}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              }
            }}
            className="w-full border-0 bg-transparent text-center text-7xl font-light leading-none tracking-tighter text-[#5a45d0] focus:outline-none disabled:opacity-40"
            aria-label="Ilość"
          />
        </div>
        <div className="pl-2 text-2xl font-bold text-slate-300">{unitLabel}</div>

        <button
          type="button"
          disabled={disabled}
          className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-100 text-slate-800 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
          onClick={() => onAdjust(1)}
          aria-label="Zwiększ"
        >
          <Plus className="h-7 w-7" />
        </button>
      </div>

      <div className="space-y-1 text-center">
        <div className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <span className="rounded bg-slate-100 px-2 py-1 text-slate-500">ENTER</span>
          ZATWIERDZA • SKAN EAN DODAJE +1 {mode === "carton" ? "KARTON" : "SZT."}
        </div>
        {pack > 1 ? (
          <p className="text-[11px] font-medium text-slate-500">
            {quantityPieces} szt.
            {mode === "carton" ? ` · ${pack} szt./karton` : ` · ${Math.floor(quantityPieces / pack)} krt. + ${quantityPieces % pack} szt.`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
