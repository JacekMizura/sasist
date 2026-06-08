import { useEffect, useState } from "react";

type Props = {
  quantity: number;
  disabled?: boolean;
  onAdjust: (delta: number) => void;
  onSetQuantity: (qty: number) => void;
};

export default function WmsInventoryQtyControl({ quantity, disabled, onAdjust, onSetQuantity }: Props) {
  const [draft, setDraft] = useState(String(quantity));

  useEffect(() => {
    setDraft(String(quantity));
  }, [quantity]);

  const commitDraft = () => {
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(quantity));
      return;
    }
    onSetQuantity(Math.max(0, parsed));
  };

  return (
    <div className="grid max-w-xs grid-cols-[36px_1fr_36px] border-2 border-slate-200 bg-white">
      <button
        type="button"
        disabled={disabled}
        className="flex h-8 items-center justify-center border-r border-slate-200 text-base font-black text-slate-800 active:bg-slate-50 disabled:opacity-40"
        onClick={() => onAdjust(-1)}
        aria-label="Zmniejsz"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft();
          }
        }}
        className="h-8 border-0 bg-transparent text-center text-base font-black tabular-nums text-[#1e4d8c] focus:outline-none focus:ring-1 focus:ring-[#1e4d8c]/30"
        aria-label="Ilość"
      />
      <button
        type="button"
        disabled={disabled}
        className="flex h-8 items-center justify-center border-l border-slate-200 text-base font-black text-slate-800 active:bg-slate-50 disabled:opacity-40"
        onClick={() => onAdjust(1)}
        aria-label="Zwiększ"
      >
        +
      </button>
    </div>
  );
}
