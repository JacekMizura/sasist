import { Minus, Package, Plus } from "lucide-react";

import type { InventoryQtyEditState } from "@/modules/inventoryCount/ui/wms/inventoryQtyUtils";
import { inventoryTotalPieces } from "@/modules/inventoryCount/ui/wms/inventoryQtyUtils";
import type { WmsQtyInputMode } from "@/modules/inventoryCount/wmsInventoryExecutionContext";

type Props = {
  qtyState: InventoryQtyEditState;
  unitsPerCarton: number;
  disabled?: boolean;
  onAdjust: (field: WmsQtyInputMode, delta: number) => void;
  onSetInputMode: (mode: WmsQtyInputMode) => void;
  onSetDraft: (draft: string | null) => void;
  onCommitDraft: () => void;
};

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(n);
}

function QtyCell({
  label,
  field,
  value,
  draft,
  disabled,
  onAdjust,
  onSetInputMode,
  onSetDraft,
  onCommitDraft,
}: {
  label: string;
  field: WmsQtyInputMode;
  value: number;
  draft: string | null;
  disabled?: boolean;
  onAdjust: (field: WmsQtyInputMode, delta: number) => void;
  onSetInputMode: (mode: WmsQtyInputMode) => void;
  onSetDraft: (draft: string | null) => void;
  onCommitDraft: () => void;
}) {
  const display = draft ?? String(value);

  return (
    <div className="flex-1 text-center">
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAdjust(field, -1)}
          className="flex h-11 w-11 items-center justify-center text-slate-700 active:bg-slate-100 disabled:opacity-30"
          aria-label={`Zmniejsz ${label.toLowerCase()}`}
        >
          <Minus size={22} strokeWidth={2.5} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={display}
          onFocus={() => onSetInputMode(field)}
          onChange={(e) => onSetDraft(e.target.value.replace(/\D/g, ""))}
          onBlur={onCommitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommitDraft();
            }
          }}
          className="w-16 border-0 bg-transparent text-center text-3xl font-black tabular-nums text-slate-900 focus:outline-none disabled:opacity-40"
          aria-label={label}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAdjust(field, 1)}
          className="flex h-11 w-11 items-center justify-center text-slate-700 active:bg-slate-100 disabled:opacity-30"
          aria-label={`Zwiększ ${label.toLowerCase()}`}
        >
          <Plus size={22} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

/** Collector qty row — kartony + sztuki + suma, large touch targets. */
export default function WmsInventoryQtyControl({
  qtyState,
  unitsPerCarton,
  disabled,
  onAdjust,
  onSetInputMode,
  onSetDraft,
  onCommitDraft,
}: Props) {
  const pack = Math.max(1, unitsPerCarton);
  const total = inventoryTotalPieces(qtyState, pack);
  const showCartons = pack > 1;

  return (
    <div className="space-y-4">
      <div className={`flex ${showCartons ? "gap-4" : ""}`}>
        {showCartons ? (
          <>
            <QtyCell
              label="Kartony"
              field="carton"
              value={qtyState.cartonsCount}
              draft={qtyState.inputMode === "carton" ? qtyState.draft : null}
              disabled={disabled}
              onAdjust={onAdjust}
              onSetInputMode={onSetInputMode}
              onSetDraft={onSetDraft}
              onCommitDraft={onCommitDraft}
            />
            <QtyCell
              label="Sztuki"
              field="unit"
              value={qtyState.unitsCount}
              draft={qtyState.inputMode === "unit" ? qtyState.draft : null}
              disabled={disabled}
              onAdjust={onAdjust}
              onSetInputMode={onSetInputMode}
              onSetDraft={onSetDraft}
              onCommitDraft={onCommitDraft}
            />
          </>
        ) : (
          <QtyCell
            label="Sztuki"
            field="unit"
            value={qtyState.unitsCount}
            draft={qtyState.inputMode === "unit" ? qtyState.draft : null}
            disabled={disabled}
            onAdjust={onAdjust}
            onSetInputMode={(mode) => {
              onSetInputMode(mode);
            }}
            onSetDraft={onSetDraft}
            onCommitDraft={onCommitDraft}
          />
        )}
      </div>

      <div className="flex items-baseline justify-between border-t border-slate-200 pt-3">
        <span className="text-xs font-black uppercase tracking-widest text-slate-500">Suma</span>
        <span className="text-2xl font-black tabular-nums text-slate-900">
          {fmtQty(total)} <span className="text-sm font-bold text-slate-500">szt.</span>
        </span>
      </div>
    </div>
  );
}
