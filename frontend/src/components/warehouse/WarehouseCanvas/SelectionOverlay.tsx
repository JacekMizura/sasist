import React from "react";
import type { RackState } from "../../../types/warehouse";
import type { LayoutState } from "../../../types/warehouse";
import { radius } from "../../../layout/designTokens";

const RACK_RADIUS_PX = parseFloat(radius.small) || 6;

type DragSlotsProps = {
  part: "dragSlots";
  dragSlotHighlights: { validSlots: Array<{ x: number; y: number; width: number; height: number }>; invalidSlots: Array<{ x: number; y: number; width: number; height: number }> };
  cellPx: number;
};

type MarqueeProps = {
  part: "marquee";
  marqueeStart: { x: number; y: number };
  marqueeEnd: { x: number; y: number };
  cellPx: number;
};

type ToolbarProps = {
  part: "toolbar";
  selectedRack: RackState | undefined;
  isMultiSelect: boolean;
  cellPx: number;
  setInternalLayoutRackId: (id: number | string | null) => void;
  setShowElevationForRackId: (id: number | string | null) => void;
  setLayout: React.Dispatch<React.SetStateAction<LayoutState>>;
  setSelectedRackId: (id: number | string | null) => void;
  setSelectedRackIds: (ids: Array<number | string>) => void;
  selectedRackIds: Array<number | string>;
};

export type SelectionOverlayProps = DragSlotsProps | MarqueeProps | ToolbarProps;

export function SelectionOverlay(props: SelectionOverlayProps) {
  if (props.part === "dragSlots") {
    const { dragSlotHighlights, cellPx } = props;
    return (
      <>
        {dragSlotHighlights.validSlots.map((slot, i) => (
          <rect
            key={`valid-${i}`}
            x={slot.x * cellPx + 1}
            y={slot.y * cellPx + 1}
            width={slot.width * cellPx - 2}
            height={slot.height * cellPx - 2}
            fill="rgba(34,197,94,0.35)"
            stroke="#22c55e"
            strokeWidth={1}
            rx={RACK_RADIUS_PX}
            pointerEvents="none"
          />
        ))}
        {dragSlotHighlights.invalidSlots.map((slot, i) => (
          <rect
            key={`invalid-${i}`}
            x={slot.x * cellPx + 1}
            y={slot.y * cellPx + 1}
            width={slot.width * cellPx - 2}
            height={slot.height * cellPx - 2}
            fill="rgba(239,68,68,0.25)"
            stroke="#ef4444"
            strokeWidth={1}
            rx={RACK_RADIUS_PX}
            pointerEvents="none"
          />
        ))}
      </>
    );
  }
  if (props.part === "marquee") {
    const { marqueeStart, marqueeEnd, cellPx } = props;
    return (
      <rect
        x={Math.min(marqueeStart.x, marqueeEnd.x) * cellPx}
        y={Math.min(marqueeStart.y, marqueeEnd.y) * cellPx}
        width={Math.abs(marqueeEnd.x - marqueeStart.x) * cellPx || cellPx}
        height={Math.abs(marqueeEnd.y - marqueeStart.y) * cellPx || cellPx}
        fill="rgba(59,130,246,0.25)"
        stroke="#3b82f6"
        strokeWidth={1.5}
        strokeDasharray="3 2"
      />
    );
  }
  const {
    selectedRack,
    isMultiSelect,
    cellPx,
    setInternalLayoutRackId,
    setShowElevationForRackId,
    setLayout,
    setSelectedRackId,
    setSelectedRackIds,
    selectedRackIds,
  } = props;
  if (!selectedRack || isMultiSelect) return null;
  return (
    <div
      className="absolute z-20 flex gap-0.5 shadow-lg rounded overflow-hidden border border-cyan-500/50 bg-slate-800"
      style={{ left: selectedRack.x * cellPx, top: selectedRack.y * cellPx - 32 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" onClick={() => setInternalLayoutRackId(selectedRack.id ?? selectedRack.rack_index)} className="p-1.5 bg-slate-700 hover:bg-cyan-600 text-cyan-100" title="Układ wewnętrzny">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
      </button>
      <button type="button" onClick={() => setShowElevationForRackId(selectedRack.id ?? selectedRack.rack_index)} className="p-1.5 bg-slate-700 hover:bg-cyan-600 text-cyan-100" title="Widok z boku">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
      </button>
      <button
        type="button"
        onClick={() => {
          const ids = new Set(selectedRackIds);
          setLayout((prev) => ({ ...prev, racks: prev.racks.filter((r) => !ids.has(r.id ?? r.rack_index)) }));
          setSelectedRackId(null);
          setSelectedRackIds([]);
        }}
        className="p-1.5 bg-slate-700 hover:bg-red-600 text-red-200"
        title="Usuń"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
      </button>
    </div>
  );
}
