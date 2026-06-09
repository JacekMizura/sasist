import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { parsedUInt } from "@/modules/inventoryCount/ui/wms/inventoryQtyUtils";

type Props = {
  quantityPieces: number;
  disabled?: boolean;
  packagingHint?: string | null;
  lastScanHint?: string | null;
  onAdjust: (delta: number) => void;
  onSetQuantity: (qty: number) => void;
};

/** Product-first qty control — always in pieces; cartons are scan-only. */
export default function WmsInventoryQtyControl({
  quantityPieces,
  disabled,
  packagingHint,
  lastScanHint,
  onAdjust,
  onSetQuantity,
}: Props) {
  const [draft, setDraft] = useState(String(quantityPieces));

  useEffect(() => {
    setDraft(String(quantityPieces));
  }, [quantityPieces]);

  const commitDraft = () => {
    const parsed = parsedUInt(draft);
    setDraft(String(parsed));
    onSetQuantity(parsed);
  };

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ilość policzona</p>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAdjust(-1)}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          aria-label="Zmniejsz o 1 szt."
        >
          <Minus size={20} strokeWidth={2.5} />
        </button>
        <div className="flex min-w-[6rem] flex-col items-center">
          <input
            type="text"
            inputMode="numeric"
            disabled={disabled}
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              }
            }}
            className="w-full border-0 bg-transparent text-center text-4xl font-black tabular-nums text-[#5a4fcf] focus:outline-none disabled:opacity-40"
            aria-label="Ilość w sztukach"
          />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">szt.</span>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAdjust(1)}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          aria-label="Zwiększ o 1 szt."
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
      </div>

      {(packagingHint || lastScanHint) && (
        <div className="space-y-0.5 text-center text-[11px] text-slate-500">
          {packagingHint ? <p>{packagingHint}</p> : null}
          {lastScanHint ? <p className="text-slate-400">{lastScanHint}</p> : null}
        </div>
      )}

      <p className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Skan EAN produktu +1 szt. • Skan EAN kartonu +X szt.
      </p>
    </div>
  );
}
