import { Plus } from "lucide-react";

import {
  cartsAppInputClass,
  cartsFieldLabelClass,
} from "../carts/cartsModuleTokens";
import RackStructureTree from "./RackStructureTree";
import { MAX_RACK_DIM, parseOptionalDim } from "./rackLayoutUtils";
import {
  addLevel,
  addBay,
  applyRackPreset,
  countSegments,
  RACK_PRESET_LABELS,
  type RackPresetId,
  type RackStructureDraft,
  type SegmentSelection,
} from "./rackStructureModel";

type Props = {
  draft: RackStructureDraft;
  onChange: (draft: RackStructureDraft) => void;
  warehouseLabel: string;
  warehouses: Array<{ id: number; name: string }>;
  showWarehouseSelect: boolean;
  structureLocked?: boolean;
  readOnly?: boolean;
  focusedBayId: string | null;
  focusedLevelId: string | null;
  onSelectBay: (bayClientId: string) => void;
  onSelectLevel: (bayClientId: string, levelClientId: string) => void;
  selection: SegmentSelection;
  onSelectSegment: (bayClientId: string, levelClientId: string, segmentClientId: string) => void;
  /** Tworzenie — preset wybrany / picker */
  appliedPreset?: RackPresetId | null;
  presetPickerOpen?: boolean;
  onApplyPreset?: (preset: RackPresetId) => void;
  onChangePreset?: () => void;
};

function DimInput({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  readOnly?: boolean;
}) {
  if (readOnly) {
    return (
      <label className="block">
        <span className={cartsFieldLabelClass}>{label}</span>
        <div className="mt-1 font-mono tabular-nums text-sm text-slate-800">{value ?? "—"}</div>
      </label>
    );
  }
  return (
    <label className="block">
      <span className={cartsFieldLabelClass}>{label}</span>
      <input
        type="number"
        min={0}
        max={MAX_RACK_DIM}
        value={value ?? ""}
        onChange={(e) => onChange(parseOptionalDim(e.target.value))}
        className={`${cartsAppInputClass} mt-1 tabular-nums`}
      />
    </label>
  );
}

const PRESETS: Array<{ id: RackPresetId; hint: string }> = [
  { id: "4x4", hint: "4 poziomy × 4 segmenty" },
  { id: "3x6", hint: "3 poziomy × 6 segmentów" },
  { id: "2x8", hint: "2 poziomy × 8 segmentów" },
  { id: "empty", hint: "1 poziom, 1 segment" },
];

export default function ConsolidationRackStructureEditor({
  draft,
  onChange,
  warehouseLabel,
  warehouses,
  showWarehouseSelect,
  structureLocked = false,
  readOnly = false,
  focusedBayId,
  focusedLevelId,
  onSelectBay,
  onSelectLevel,
  selection,
  onSelectSegment,
  appliedPreset = null,
  presetPickerOpen = false,
  onApplyPreset,
  onChangePreset,
}: Props) {
  const updateDraft = (patch: Partial<RackStructureDraft>) => onChange({ ...draft, ...patch });
  const totalSegments = countSegments(draft);
  const showPresetSection = !readOnly && onApplyPreset;

  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">Dane regału</h2>
        <div className="mt-2 space-y-2">
          <label className="block">
            <span className={cartsFieldLabelClass}>Nazwa regału</span>
            {readOnly ? (
              <div className="mt-1 font-mono text-sm font-semibold text-slate-900">{draft.rackName}</div>
            ) : (
              <input
                type="text"
                value={draft.rackName}
                onChange={(e) => updateDraft({ rackName: e.target.value })}
                className={`${cartsAppInputClass} mt-1`}
                placeholder="RK-01"
              />
            )}
          </label>
          <label className="block">
            <span className={cartsFieldLabelClass}>Magazyn</span>
            {readOnly || !showWarehouseSelect ? (
              <div className="mt-1 text-sm font-medium text-slate-800">{warehouseLabel}</div>
            ) : (
              <select
                value={draft.warehouseId}
                onChange={(e) => updateDraft({ warehouseId: Number(e.target.value) })}
                className={`${cartsAppInputClass} mt-1`}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <DimInput
              label="Szerokość (mm)"
              value={draft.totalWidthMm}
              onChange={(v) => updateDraft({ totalWidthMm: v })}
              readOnly={readOnly}
            />
            <DimInput
              label="Głębokość (mm)"
              value={draft.totalDepthMm}
              onChange={(v) => updateDraft({ totalDepthMm: v })}
              readOnly={readOnly}
            />
          </div>
        </div>
      </section>

      {showPresetSection ? (
        <section>
          {presetPickerOpen || !appliedPreset ? (
            <>
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">Szybki preset</h2>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.hint}
                    onClick={() => onApplyPreset?.(p.id)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-xs font-medium text-slate-800 hover:border-violet-300 hover:bg-violet-50/50"
                  >
                    {RACK_PRESET_LABELS[p.id]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs">
              <span className="text-slate-600">
                Preset: <span className="font-semibold text-slate-900">{RACK_PRESET_LABELS[appliedPreset]}</span>
              </span>
              <button
                type="button"
                onClick={() => onChangePreset?.()}
                className="rounded border border-violet-200 px-2 py-0.5 font-medium text-violet-900 hover:bg-violet-50/60"
              >
                Zmień preset
              </button>
            </div>
          )}
        </section>
      ) : null}

      <section>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">Struktura regału</h2>
          <span className="text-[11px] tabular-nums text-slate-500">
            {draft.bays.length} rack · {totalSegments} seg.
          </span>
        </div>

        <div className="mt-2">
          <RackStructureTree
            draft={draft}
            readOnly={readOnly}
            structureLocked={structureLocked}
            focusedBayId={focusedBayId}
            focusedLevelId={focusedLevelId}
            selection={selection}
            onChange={onChange}
            onSelectBay={onSelectBay}
            onSelectLevel={onSelectLevel}
            onSelectSegment={onSelectSegment}
          />
        </div>

        {!readOnly && !structureLocked ? (
          <button
            type="button"
            onClick={() => onChange(addBay(draft))}
            className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-violet-200 bg-white text-xs font-medium text-violet-900 hover:bg-violet-50/60"
          >
            <Plus className="h-3.5 w-3.5" />
            Dodaj rack
          </button>
        ) : structureLocked ? (
          <p className="mt-2 text-[11px] text-slate-500">
            Wybierz poziom w drzewie — segmenty edytujesz w tabeli nad podglądem.
          </p>
        ) : null}
      </section>
    </div>
  );
}
