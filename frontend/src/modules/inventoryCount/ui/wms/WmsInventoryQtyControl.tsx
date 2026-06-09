import { Minus, Plus } from "lucide-react";

import type { InventoryQtyEditState } from "@/modules/inventoryCount/ui/wms/inventoryQtyUtils";
import { inventoryTotalPieces } from "@/modules/inventoryCount/ui/wms/inventoryQtyUtils";
import type { WmsQtyInputMode } from "@/modules/inventoryCount/wmsInventoryExecutionContext";

type Props = {
  qtyState: InventoryQtyEditState;
  unitsPerCarton: number;
  disabled?: boolean;
  lastScanKind?: "unit" | "carton" | null;
  onAdjust: (field: WmsQtyInputMode, delta: number) => void;
  onSetField: (field: WmsQtyInputMode, value: number) => void;
  onSetInputMode: (mode: WmsQtyInputMode) => void;
  onSetDraft: (draft: string | null) => void;
  onCommitDraft: () => void;
};

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(n);
}

function QtyColumn({
  label,
  field,
  value,
  draft,
  active,
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
  active: boolean;
  disabled?: boolean;
  onAdjust: (field: WmsQtyInputMode, delta: number) => void;
  onSetInputMode: (mode: WmsQtyInputMode) => void;
  onSetDraft: (draft: string | null) => void;
  onCommitDraft: () => void;
}) {
  const display = draft ?? String(value);

  return (
    <div
      className={`flex flex-1 flex-col rounded-xl border px-3 py-2 ${
        active ? "border-slate-300 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAdjust(field, -1)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          aria-label={`Zmniejsz ${label.toLowerCase()}`}
        >
          <Minus size={16} strokeWidth={2.5} />
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
          className="w-full min-w-0 border-0 bg-transparent text-center text-2xl font-black tabular-nums text-slate-900 focus:outline-none disabled:opacity-40"
          aria-label={label}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAdjust(field, 1)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          aria-label={`Zwiększ ${label.toLowerCase()}`}
        >
          <Plus size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

/** Compact kartony + sztuki counters with total — scan-first, not calculator modal. */
export default function WmsInventoryQtyControl({
  qtyState,
  unitsPerCarton,
  disabled,
  lastScanKind,
  onAdjust,
  onSetField,
  onSetInputMode,
  onSetDraft,
  onCommitDraft,
}: Props) {
  const pack = Math.max(1, unitsPerCarton);
  const total = inventoryTotalPieces(qtyState, pack);
  const showCartons = pack > 1;

  return (
    <div className="space-y-2">
      {showCartons ? (
        <div className="flex gap-2">
          <QtyColumn
            label="Kartony"
            field="carton"
            value={qtyState.cartonsCount}
            draft={qtyState.inputMode === "carton" ? qtyState.draft : null}
            active={qtyState.inputMode === "carton" || lastScanKind === "carton"}
            disabled={disabled}
            onAdjust={onAdjust}
            onSetInputMode={onSetInputMode}
            onSetDraft={onSetDraft}
            onCommitDraft={onCommitDraft}
          />
          <QtyColumn
            label="Sztuki"
            field="unit"
            value={qtyState.unitsCount}
            draft={qtyState.inputMode === "unit" ? qtyState.draft : null}
            active={qtyState.inputMode === "unit" || lastScanKind === "unit"}
            disabled={disabled}
            onAdjust={onAdjust}
            onSetInputMode={onSetInputMode}
            onSetDraft={onSetDraft}
            onCommitDraft={onCommitDraft}
          />
        </div>
      ) : (
        <QtyColumn
          label="Sztuki"
          field="unit"
          value={qtyState.unitsCount}
          draft={qtyState.inputMode === "unit" ? qtyState.draft : null}
          active
          disabled={disabled}
          onAdjust={onAdjust}
          onSetInputMode={onSetInputMode}
          onSetDraft={(d) => {
            onSetInputMode("unit");
            onSetDraft(d);
          }}
          onCommitDraft={onCommitDraft}
        />
      )}

      <div className="flex items-baseline justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Suma</span>
        <span className="text-lg font-black tabular-nums text-slate-900">
          {fmtQty(total)} <span className="text-xs font-bold text-slate-500">szt.</span>
        </span>
      </div>
    </div>
  );
}
