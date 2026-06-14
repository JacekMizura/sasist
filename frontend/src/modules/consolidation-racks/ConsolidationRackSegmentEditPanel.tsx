import { X } from "lucide-react";

import {
  cartsAppInputClass,
  cartsFieldLabelClass,
} from "../carts/cartsModuleTokens";
import { computeCapacityDm3, MAX_RACK_DIM, parseOptionalDim } from "./rackLayoutUtils";
import type { LevelDraft, SegmentDraft } from "./rackStructureModel";

type Props = {
  segmentLabel?: string;
  level?: LevelDraft;
  segment?: SegmentDraft;
  readOnly?: boolean;
  onUpdate: (patch: Partial<SegmentDraft>) => void;
  onClose?: () => void;
  occupancy?: {
    isOccupied: boolean;
    orderNumber?: string | null;
    utilizationPercent?: number | null;
    capacityDm3?: number | null;
  };
  /** OMS — panel zawsze widoczny; pusty stan gdy brak wyboru. */
  empty?: boolean;
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

/** Panel edycji pojedynczego segmentu — zawsze max. jeden formularz na ekranie. */
export default function ConsolidationRackSegmentEditPanel({
  segmentLabel = "",
  level,
  segment,
  readOnly = false,
  onUpdate,
  onClose,
  occupancy,
  empty = false,
}: Props) {
  if (empty || !level || !segment) {
    return (
      <div className="flex h-full min-h-[280px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-3 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Segment</div>
          <div className="text-sm font-medium text-slate-500">Wybierz segment</div>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-slate-400">
          Kliknij segment w drzewie lub podglądzie racka, aby edytować wymiary i nazwę.
        </div>
      </div>
    );
  }

  const height = segment.heightMm ?? level.levelHeightMm;
  const cap = computeCapacityDm3(segment.depthMm, segment.widthMm, height);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/60 px-3 py-2.5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Segment</div>
          <div className="font-mono text-base font-bold text-slate-900">{segmentLabel}</div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-violet-50/50"
            aria-label="Zamknij panel segmentu"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {occupancy ? (
          <div
            className={`mb-3 rounded-lg border px-2.5 py-2 text-xs ${
              occupancy.isOccupied
                ? "border-orange-200 bg-orange-50/80 text-orange-950"
                : "border-emerald-200 bg-emerald-50/80 text-emerald-950"
            }`}
          >
            <span className="font-bold uppercase tracking-wide">
              {occupancy.isOccupied ? "Zajęty" : "Wolny"}
            </span>
            {occupancy.isOccupied && occupancy.orderNumber ? (
              <div className="mt-1 font-mono font-semibold">{occupancy.orderNumber}</div>
            ) : null}
            {occupancy.isOccupied && occupancy.utilizationPercent != null ? (
              <div className="mt-0.5 tabular-nums">Wykorzystanie pojemności: {Math.round(occupancy.utilizationPercent)}%</div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3">
          <label className="block">
            <span className={cartsFieldLabelClass}>Nazwa (opcjonalnie)</span>
            {readOnly ? (
              <div className="mt-1 font-mono text-sm text-slate-800">{segment.slotLabel.trim() || "— auto —"}</div>
            ) : (
              <input
                type="text"
                value={segment.slotLabel}
                onChange={(e) => onUpdate({ slotLabel: e.target.value })}
                placeholder="puste = auto"
                className={`${cartsAppInputClass} mt-1 font-mono`}
              />
            )}
          </label>
          <DimInput label="Szerokość (mm)" value={segment.widthMm} onChange={(v) => onUpdate({ widthMm: v })} readOnly={readOnly} />
          <DimInput label="Głębokość (mm)" value={segment.depthMm} onChange={(v) => onUpdate({ depthMm: v })} readOnly={readOnly} />
          <DimInput
            label="Wysokość (mm)"
            value={segment.heightMm ?? level.levelHeightMm}
            onChange={(v) => onUpdate({ heightMm: v })}
            readOnly={readOnly}
          />
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="text-xs font-medium text-slate-600">Pojemność (auto)</span>
            <div className="font-mono text-lg font-bold text-violet-900">
              {cap != null ? `${cap.toFixed(0)} dm³` : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
