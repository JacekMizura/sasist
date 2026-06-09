import { Minus, Plus } from "lucide-react";

import type { InventoryQtyEditState } from "@/modules/inventoryCount/ui/wms/inventoryQtyUtils";
import {
  formatCartonUnitSummary,
  inventoryTotalPieces,
  parsedUInt,
} from "@/modules/inventoryCount/ui/wms/inventoryQtyUtils";
import type { WmsQtyInputMode } from "@/modules/inventoryCount/wmsInventoryExecutionContext";

type Props = {
  qtyState: InventoryQtyEditState;
  unitsPerCarton: number;
  disabled?: boolean;
  onModeChange: (mode: WmsQtyInputMode) => void;
  onAdjust: (field: WmsQtyInputMode, delta: number) => void;
  onSetField: (field: WmsQtyInputMode, value: number) => void;
  onDraftChange: (draft: string | null) => void;
  onCommitDraft: () => void;
};

function CounterBlock({
  label,
  value,
  unitLabel,
  active,
  disabled,
  draft,
  onFocus,
  onDraftChange,
  onCommit,
  onAdjust,
}: {
  label: string;
  value: number;
  unitLabel: string;
  active: boolean;
  disabled?: boolean;
  draft: string | null;
  onFocus: () => void;
  onDraftChange: (draft: string | null) => void;
  onCommit: () => void;
  onAdjust: (delta: number) => void;
}) {
  const display = draft !== null && active ? draft : String(value);

  return (
    <div
      className={`rounded-[24px] border p-5 text-center transition-colors ${
        active ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200 bg-white"
      }`}
    >
      <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAdjust(-1)}
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
          aria-label={`Zmniejsz ${label.toLowerCase()}`}
        >
          <Minus size={22} strokeWidth={2.5} />
        </button>
        <div className="flex min-w-[5rem] flex-col items-center">
          <input
            type="text"
            inputMode="numeric"
            disabled={disabled}
            value={display}
            onFocus={onFocus}
            onChange={(e) => onDraftChange(e.target.value.replace(/\D/g, ""))}
            onBlur={onCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCommit();
              }
            }}
            className="w-full border-0 bg-transparent text-center text-4xl font-black tabular-nums text-indigo-600 focus:outline-none disabled:opacity-40"
            aria-label={label}
          />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{unitLabel}</span>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAdjust(1)}
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
          aria-label={`Zwiększ ${label.toLowerCase()}`}
        >
          <Plus size={22} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

/** Integer carton + unit counters — total in pieces only (no fractional cartons). */
export default function WmsInventoryQtyControl({
  qtyState,
  unitsPerCarton,
  disabled,
  onModeChange,
  onAdjust,
  onSetField,
  onDraftChange,
  onCommitDraft,
}: Props) {
  const pack = Math.max(1, unitsPerCarton);
  const hasCartons = pack > 1;
  const totalPieces = inventoryTotalPieces(qtyState, pack);
  const summary = formatCartonUnitSummary(totalPieces, pack);

  const commitForField = (field: WmsQtyInputMode) => {
    if (qtyState.draft === null || qtyState.inputMode !== field) return;
    const v = parsedUInt(qtyState.draft);
    onSetField(field, v);
  };

  if (!hasCartons) {
    return (
      <div>
        <CounterBlock
          label="Sztuki"
          value={qtyState.unitsCount}
          unitLabel="szt."
          active
          disabled={disabled}
          draft={qtyState.inputMode === "unit" ? qtyState.draft : null}
          onFocus={() => onModeChange("unit")}
          onDraftChange={onDraftChange}
          onCommit={() => {
            if (qtyState.inputMode === "unit") commitForField("unit");
            else onCommitDraft();
          }}
          onAdjust={(d) => onAdjust("unit", d)}
        />
        <p className="mt-4 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Enter zatwierdza • Skan EAN dodaje +1 szt.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CounterBlock
          label="Kartony"
          value={qtyState.cartonsCount}
          unitLabel="krt."
          active={qtyState.inputMode === "carton"}
          disabled={disabled}
          draft={qtyState.inputMode === "carton" ? qtyState.draft : null}
          onFocus={() => onModeChange("carton")}
          onDraftChange={onDraftChange}
          onCommit={() => commitForField("carton")}
          onAdjust={(d) => onAdjust("carton", d)}
        />
        <CounterBlock
          label="Sztuki"
          value={qtyState.unitsCount}
          unitLabel="szt."
          active={qtyState.inputMode === "unit"}
          disabled={disabled}
          draft={qtyState.inputMode === "unit" ? qtyState.draft : null}
          onFocus={() => onModeChange("unit")}
          onDraftChange={onDraftChange}
          onCommit={() => commitForField("unit")}
          onAdjust={(d) => onAdjust("unit", d)}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Suma</p>
        <p className="mt-1 text-3xl font-black tabular-nums text-indigo-600">
          {totalPieces} <span className="text-sm font-bold text-slate-400">szt.</span>
        </p>
        {summary ? <p className="mt-1 text-[11px] font-medium text-slate-500">{summary}</p> : null}
      </div>

      <p className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Enter zatwierdza • Skan EAN kartonu +1 krt. • Skan sztuki +1 szt.
      </p>
    </div>
  );
}
