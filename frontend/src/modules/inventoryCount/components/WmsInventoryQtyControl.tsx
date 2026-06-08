import { useEffect, useState } from "react";

import { WMS_INV } from "../wmsIndustrialTheme";

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
    <div className="grid grid-cols-[44px_1fr_44px] overflow-hidden rounded border border-[#d0d7e2]">
      <button
        type="button"
        disabled={disabled}
        className={`${WMS_INV.btnQuick} rounded-none border-0 border-r border-[#d0d7e2] text-lg`}
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
        className="h-9 border-0 bg-white text-center text-lg font-black tabular-nums text-[#1e4d8c] focus:outline-none focus:ring-1 focus:ring-[#1e4d8c]/40"
        aria-label="Ilość"
      />
      <button
        type="button"
        disabled={disabled}
        className={`${WMS_INV.btnQuick} rounded-none border-0 border-l border-[#d0d7e2] text-lg`}
        onClick={() => onAdjust(1)}
        aria-label="Zwiększ"
      >
        +
      </button>
    </div>
  );
}
