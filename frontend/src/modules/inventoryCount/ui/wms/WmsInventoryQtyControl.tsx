import { Minus, Plus } from "lucide-react";

import type { InventoryQtyEditState } from "@/modules/inventoryCount/ui/wms/inventoryQtyUtils";
import { inventoryTotalPieces } from "@/modules/inventoryCount/ui/wms/inventoryQtyUtils";
import type { WmsQtyInputMode } from "@/modules/inventoryCount/wmsInventoryExecutionContext";

type Props = {
  qtyState: InventoryQtyEditState;
  unitsPerCarton: number;
  packagingLoaded?: boolean;
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
      <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAdjust(field, -1)}
          className="flex h-10 w-10 items-center justify-center text-slate-700 active:bg-slate-100 disabled:opacity-30"
          aria-label={`Zmniejsz ${label.toLowerCase()}`}
        >
          <Minus size={20} strokeWidth={2.5} />
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
          className="w-14 border-0 bg-transparent text-center text-2xl font-black tabular-nums text-slate-900 focus:outline-none disabled:opacity-40"
          aria-label={label}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAdjust(field, 1)}
          className="flex h-10 w-10 items-center justify-center text-slate-700 active:bg-slate-100 disabled:opacity-30"
          aria-label={`Zwiększ ${label.toLowerCase()}`}
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

/** Compact collector qty — kartony + sztuki + suma. */
export default function WmsInventoryQtyControl({
  qtyState,
  unitsPerCarton,
  packagingLoaded = true,
  disabled,
  onAdjust,
  onSetInputMode,
  onSetDraft,
  onCommitDraft,
}: Props) {
  const pack = Math.max(1, unitsPerCarton);
  const total = inventoryTotalPieces(qtyState, pack);
  const showCartons = pack > 1;
  const controlsDisabled = disabled || !packagingLoaded;

  if (!packagingLoaded) {
    return (
      <div className="rounded-xl bg-slate-50/80 px-2 py-4 text-center text-xs font-bold text-slate-400">
        Wczytywanie opakowania…
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl bg-slate-50/80 px-2 py-3">
      <div className={`flex ${showCartons ? "gap-2" : ""}`}>
        {showCartons ? (
          <>
            <QtyCell
              label="Kartony"
              field="carton"
              value={qtyState.cartonsCount}
              draft={qtyState.inputMode === "carton" ? qtyState.draft : null}
              disabled={controlsDisabled}
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
              disabled={controlsDisabled}
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
            disabled={controlsDisabled}
            onAdjust={onAdjust}
            onSetInputMode={(mode) => {
              onSetInputMode(mode);
            }}
            onSetDraft={onSetDraft}
            onCommitDraft={onCommitDraft}
          />
        )}
      </div>

      <div className="flex items-baseline justify-center gap-2 pt-1">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Suma</span>
        <span className="text-xl font-black tabular-nums text-slate-900">
          {fmtQty(total)} <span className="text-xs font-bold text-slate-500">szt.</span>
        </span>
      </div>
    </div>
  );
}
