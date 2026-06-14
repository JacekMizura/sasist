import { useLayoutEffect, useRef, useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";

import {
  addLevel,
  addSegment,
  bayDisplayLabel,
  duplicateSegment,
  removeLevel,
  removeSegment,
  segmentDisplayLabel,
  type BayDraft,
  type RackStructureDraft,
  type SegmentDraft,
  type SegmentSelection,
} from "./rackStructureModel";
import { computeCapacityDm3 } from "./rackLayoutUtils";
import ConsolidationRackSegmentDrawer from "./ConsolidationRackSegmentDrawer";

type Props = {
  draft: RackStructureDraft;
  bay: BayDraft | null;
  focusedBayId: string | null;
  selection: SegmentSelection;
  readOnly?: boolean;
  structureLocked?: boolean;
  onChange: (draft: RackStructureDraft) => void;
  onSelectBay: (bayClientId: string) => void;
  onSelectSegment: (bayClientId: string, levelClientId: string, segmentClientId: string) => void;
  onClearSelection: () => void;
};

const MIN_SEGMENT_PX = 88;
const SEGMENT_HEIGHT = 108;
const GAP_PX = 8;

export default function ConsolidationRackVisualEditor({
  draft,
  bay,
  focusedBayId,
  selection,
  readOnly = false,
  structureLocked = false,
  onChange,
  onSelectBay,
  onSelectSegment,
  onClearSelection,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidthPx, setContainerWidthPx] = useState(900);
  const canEditStructure = !readOnly && !structureLocked;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidthPx(el.offsetWidth ?? 900);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const activeBay = bay ?? draft.bays[0] ?? null;
  if (!activeBay) {
    return (
      <div className="flex min-h-[240px] w-full items-center justify-center text-sm text-slate-500">
        Brak racka w konfiguracji.
      </div>
    );
  }

  const selectedHit =
    selection && selection.bayClientId === activeBay.clientId
      ? (() => {
          const lv = activeBay.levels.find((l) => l.clientId === selection.levelClientId);
          const seg = lv?.segments.find((s) => s.clientId === selection.segmentClientId);
          return lv && seg ? { level: lv, segment: seg } : null;
        })()
      : null;

  const updateSelectedSegment = (patch: Partial<SegmentDraft>) => {
    if (!selection) return;
    onChange({
      ...draft,
      bays: draft.bays.map((b) => {
        if (b.clientId !== selection.bayClientId) return b;
        return {
          ...b,
          levels: b.levels.map((lv) => {
            if (lv.clientId !== selection.levelClientId) return lv;
            return {
              ...lv,
              segments: lv.segments.map((s) =>
                s.clientId === selection.segmentClientId ? { ...s, ...patch } : s,
              ),
            };
          }),
        };
      }),
    });
  };

  return (
    <>
      <div ref={containerRef} className="flex h-full min-h-0 w-full flex-col gap-4">
        {draft.bays.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {draft.bays.map((b) => (
              <button
                key={b.clientId}
                type="button"
                onClick={() => onSelectBay(b.clientId)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  (focusedBayId ?? activeBay.clientId) === b.clientId
                    ? "border-orange-300 bg-orange-50 text-orange-950"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-violet-50/40"
                }`}
              >
                {bayDisplayLabel(b)}
              </button>
            ))}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {activeBay.levels.map((lv) => {
            const levelTitle = lv.name.trim() || String.fromCharCode(65 + lv.levelIndex);
            const rowTotalMm = lv.segments.reduce((s, seg) => s + (seg.widthMm ?? 0), 0);
            const buttonAreaPx = canEditStructure ? 44 : 0;
            const availablePx = Math.max(
              100,
              containerWidthPx - (lv.segments.length > 0 ? (lv.segments.length - 1) * GAP_PX + buttonAreaPx : 0),
            );
            const scale = rowTotalMm > 0 ? availablePx / rowTotalMm : 1;

            return (
              <div key={lv.clientId} className="w-full">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Poziom {levelTitle}
                  </span>
                  {canEditStructure && activeBay.levels.length > 1 ? (
                    <button
                      type="button"
                      title="Usuń poziom"
                      onClick={() => onChange(removeLevel(draft, activeBay.clientId, lv.clientId))}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>

                <div className="flex w-full items-stretch gap-2">
                  {lv.segments.map((seg) => {
                    const label = segmentDisplayLabel(lv, seg);
                    const isActive =
                      selection?.bayClientId === activeBay.clientId
                      && selection.levelClientId === lv.clientId
                      && selection.segmentClientId === seg.clientId;
                    const wMm = seg.widthMm ?? 0;
                    const dMm = seg.depthMm ?? draft.totalDepthMm ?? 0;
                    const hMm = seg.heightMm ?? lv.levelHeightMm ?? 0;
                    const widthPx = Math.max(wMm * scale, MIN_SEGMENT_PX);
                    const cap = computeCapacityDm3(seg.depthMm, seg.widthMm, hMm);

                    return (
                      <div
                        key={seg.clientId}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectSegment(activeBay.clientId, lv.clientId, seg.clientId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectSegment(activeBay.clientId, lv.clientId, seg.clientId);
                          }
                        }}
                        className={`flex shrink-0 cursor-pointer flex-col rounded-lg border p-3 transition-shadow ${
                          isActive
                            ? "border-orange-400 bg-orange-50/80 ring-2 ring-orange-300"
                            : "border-slate-200 bg-white hover:border-violet-300 hover:shadow-sm"
                        }`}
                        style={{ width: `${widthPx}px`, minHeight: `${SEGMENT_HEIGHT}px` }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-sm font-bold text-slate-900">{label}</p>
                          <p className="mt-1 text-[12px] tabular-nums text-slate-600">
                            {Math.round(wMm)} × {Math.round(dMm)} × {Math.round(hMm)} mm
                          </p>
                          {cap != null ? (
                            <p className="mt-0.5 text-xs font-semibold tabular-nums text-violet-800">
                              {cap.toFixed(0)} dm³
                            </p>
                          ) : null}
                        </div>
                        {!readOnly ? (
                          <div className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2">
                            <button
                              type="button"
                              title="Edytuj"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectSegment(activeBay.clientId, lv.clientId, seg.clientId);
                              }}
                              className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil className="h-3 w-3" />
                              Edytuj
                            </button>
                            {canEditStructure && lv.segments.length > 1 ? (
                              <button
                                type="button"
                                title="Usuń"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onChange(removeSegment(draft, activeBay.clientId, lv.clientId, seg.clientId));
                                  if (selection?.segmentClientId === seg.clientId) onClearSelection();
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            ) : null}
                            {canEditStructure ? (
                              <button
                                type="button"
                                title="Duplikuj"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onChange(
                                    duplicateSegment(draft, activeBay.clientId, lv.clientId, seg.clientId),
                                  );
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-violet-50"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  {canEditStructure ? (
                    <button
                      type="button"
                      onClick={() => onChange(addSegment(draft, activeBay.clientId, lv.clientId))}
                      className="flex h-[116px] w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 text-[11px] font-semibold text-slate-500 hover:border-violet-300 hover:text-violet-900"
                      aria-label="Dodaj segment"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}

          {canEditStructure ? (
            <button
              type="button"
              onClick={() => onChange(addLevel(draft, activeBay.clientId))}
              className="w-full rounded-lg border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 hover:border-violet-300 hover:text-violet-900"
            >
              + Dodaj poziom
            </button>
          ) : null}
        </div>
      </div>

      {selectedHit ? (
        <ConsolidationRackSegmentDrawer
          open
          rackName={draft.rackName}
          level={selectedHit.level}
          segment={selectedHit.segment}
          readOnly={readOnly}
          canRemove={canEditStructure && selectedHit.level.segments.length > 1}
          onClose={onClearSelection}
          onChange={updateSelectedSegment}
          onRemove={
            canEditStructure && selection
              ? () => {
                  onChange(removeSegment(draft, activeBay.clientId, selection.levelClientId, selection.segmentClientId));
                  onClearSelection();
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}
