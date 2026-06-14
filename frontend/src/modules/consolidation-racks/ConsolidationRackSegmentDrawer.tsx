import { X } from "lucide-react";

import { cartsAppInputClass, cartsFieldLabelClass } from "../carts/cartsModuleTokens";
import { computeCapacityDm3, MAX_RACK_DIM, parseOptionalDim } from "./rackLayoutUtils";
import { segmentDisplayLabel, type LevelDraft, type SegmentDraft } from "./rackStructureModel";

type Props = {
  open: boolean;
  rackName: string;
  level: LevelDraft;
  segment: SegmentDraft;
  readOnly?: boolean;
  canRemove?: boolean;
  onClose: () => void;
  onChange: (patch: Partial<SegmentDraft>) => void;
  onRemove?: () => void;
};

export default function ConsolidationRackSegmentDrawer({
  open,
  rackName,
  level,
  segment,
  readOnly = false,
  canRemove = false,
  onClose,
  onChange,
  onRemove,
}: Props) {
  if (!open) return null;

  const label = segmentDisplayLabel(level, segment);
  const h = segment.heightMm ?? level.levelHeightMm ?? 0;
  const cap = computeCapacityDm3(segment.depthMm, segment.widthMm, h);
  const scanLabel = `${rackName.trim() || "RK-XX"}/${label}`;

  return (
    <div
      className="fixed inset-0 z-[280] flex justify-end bg-slate-900/30 backdrop-blur-[1px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Edycja segmentu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Poziom {level.name.trim() || String.fromCharCode(65 + level.levelIndex)}
            </p>
            <h2 className="mt-0.5 font-mono text-lg font-bold text-slate-900">{label}</h2>
            <p className="mt-1 font-mono text-xs text-violet-800">{scanLabel}</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Zamknij"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <label className="block">
            <span className={cartsFieldLabelClass}>Nazwa segmentu</span>
            {readOnly ? (
              <div className="mt-1 font-mono text-sm text-slate-800">{segment.slotLabel.trim() || label}</div>
            ) : (
              <input
                type="text"
                value={segment.slotLabel}
                onChange={(e) => onChange({ slotLabel: e.target.value })}
                placeholder="auto"
                className={`${cartsAppInputClass} mt-1 font-mono`}
                autoFocus
              />
            )}
          </label>

          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["widthMm", "Szerokość", segment.widthMm],
                ["depthMm", "Głębokość", segment.depthMm],
                ["heightMm", "Wysokość", segment.heightMm ?? level.levelHeightMm],
              ] as const
            ).map(([field, labelText, val]) => (
              <label key={field} className="block">
                <span className={cartsFieldLabelClass}>{labelText} (mm)</span>
                {readOnly ? (
                  <div className="mt-1 font-mono tabular-nums text-sm text-slate-800">{val ?? "—"}</div>
                ) : (
                  <input
                    type="number"
                    min={0}
                    max={MAX_RACK_DIM}
                    value={val ?? ""}
                    onChange={(e) => onChange({ [field]: parseOptionalDim(e.target.value) })}
                    className={`${cartsAppInputClass} mt-1 tabular-nums`}
                  />
                )}
              </label>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pojemność</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-violet-900">
              {cap != null ? `${cap.toFixed(0)} dm³` : "—"}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          {canRemove && onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Usuń segment
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Gotowe
          </button>
        </div>
      </div>
    </div>
  );
}
