import { useCallback } from "react";
import type { LayoutState } from "../../../types/warehouse";
import { getCellFromWarehouseLayoutSvg } from "../utils/designerMouseUtils";
import {
  applyPassagePlacements,
  corridorSpecFromDrag,
  findRackPassage,
  layoutCellCenterCm,
  moveCorridorByDelta,
  rackFootprintCm,
  rackUuid,
  worldCorridorToPassagesFromSpec,
} from "../passages/rackPassageGeometry";

export type SelectedPassage = { rackUuid: string; passageUuid: string };

export interface UsePassageInteractionParams {
  passageToolActive: boolean;
  passageDrawStart: { x: number; y: number } | null;
  passageDrawEnd: { x: number; y: number } | null;
  passageWidthCm: number;
  layout: LayoutState;
  draggingPassage: { rackUuid: string; passageUuid: string; grabOffsetCm: number } | null;
  refs: {
    passageDrawEndPendingRef: React.MutableRefObject<{ x: number; y: number } | null>;
    passageDrawEndRafRef: React.MutableRefObject<number | null>;
    passageShiftKeyRef: React.MutableRefObject<boolean>;
    lastMouseRef: React.MutableRefObject<{ clientX: number; clientY: number } | null>;
    svgRef: React.RefObject<SVGSVGElement | null>;
  };
  getCellFromEvent: (e: { clientX: number; clientY: number }) => { x: number; y: number } | null;
  setPassageDrawStart: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  setPassageDrawEnd: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  setLayout: React.Dispatch<React.SetStateAction<LayoutState>>;
  setSelectedPassage: React.Dispatch<React.SetStateAction<SelectedPassage | null>>;
  setDraggingPassage: React.Dispatch<
    React.SetStateAction<{ rackUuid: string; passageUuid: string; grabOffsetCm: number } | null>
  >;
  clearAllSelections: () => void;
}

export function usePassageInteraction(params: UsePassageInteractionParams) {
  const {
    passageToolActive,
    passageDrawStart,
    passageDrawEnd,
    passageWidthCm,
    layout,
    draggingPassage,
    refs,
    setPassageDrawStart,
    setPassageDrawEnd,
    setLayout,
    setSelectedPassage,
    setDraggingPassage,
    clearAllSelections,
  } = params;
  const { passageDrawEndPendingRef, passageDrawEndRafRef, passageShiftKeyRef, lastMouseRef, svgRef } = refs;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, cell: { x: number; y: number }) => {
      if (passageToolActive && e.button === 0) {
        if (!passageDrawStart) {
          clearAllSelections();
          setSelectedPassage(null);
          setPassageDrawStart(cell);
          setPassageDrawEnd(cell);
        }
        return true;
      }
      return false;
    },
    [
      passageToolActive,
      passageDrawStart,
      clearAllSelections,
      setSelectedPassage,
      setPassageDrawStart,
      setPassageDrawEnd,
    ]
  );

  const handleMouseMove = useCallback(
    (_e: React.MouseEvent<SVGSVGElement>, cell: { x: number; y: number } | null) => {
      if (passageToolActive && passageDrawStart && cell) {
        passageDrawEndPendingRef.current = cell;
        if (passageDrawEndRafRef.current == null) {
          passageDrawEndRafRef.current = requestAnimationFrame(() => {
            passageDrawEndRafRef.current = null;
            const pending = passageDrawEndPendingRef.current;
            if (pending) {
              setPassageDrawEnd((prev) => (prev?.x === pending.x && prev?.y === pending.y ? prev : pending));
            }
          });
        }
      }
      if (draggingPassage && cell) {
        const hit = findRackPassage(layout, draggingPassage.rackUuid, draggingPassage.passageUuid);
        if (!hit) return;
        const { rack, passage } = hit;
        const center = layoutCellCenterCm(cell);
        const fp = rackFootprintCm(rack);
        const alongIsX = (rack.orientation || "vertical").toLowerCase() === "horizontal";
        const cursorAlong = alongIsX ? center.x : center.y;
        const fpOrigin = alongIsX ? fp.minX : fp.minY;
        const nextOffset = Math.max(0, cursorAlong - draggingPassage.grabOffsetCm - fpOrigin);
        const delta = nextOffset - passage.offset_along_cm;
        if (Math.abs(delta) < 0.01) return;
        setLayout((prev) =>
          moveCorridorByDelta(prev, passage.corridor_uuid, delta, {
            rackUuid: draggingPassage.rackUuid,
            passageUuid: draggingPassage.passageUuid,
          })
        );
      }
    },
    [
      passageToolActive,
      passageDrawStart,
      draggingPassage,
      layout,
      passageDrawEndPendingRef,
      passageDrawEndRafRef,
      setPassageDrawEnd,
      setLayout,
    ]
  );

  const handleMouseUp = useCallback(() => {
      if (passageToolActive && passageDrawStart) {
        let end = passageDrawEndPendingRef.current ?? passageDrawEnd;
        if (end == null && lastMouseRef.current && svgRef.current) {
          end = getCellFromWarehouseLayoutSvg(
            svgRef.current,
            lastMouseRef.current.clientX,
            lastMouseRef.current.clientY,
            layout.grid_cols,
            layout.grid_rows
          );
        }
        if (end) {
          const startCm = layoutCellCenterCm(passageDrawStart);
          const endCm = layoutCellCenterCm(end);
          const spec = corridorSpecFromDrag(startCm, endCm, passageWidthCm, {
            freeAngle: passageShiftKeyRef.current,
          });
          const placements = worldCorridorToPassagesFromSpec(layout.racks, spec);
          if (placements.length > 0) {
            setLayout((prev) => {
              const next = applyPassagePlacements(prev, placements);
              // Select first member — group edit treats corridor as one.
              const p = placements[0];
              const rack = next.racks.find((r) => rackUuid(r) === p.rackUuid);
              const created = (rack?.passages ?? []).find(
                (x) =>
                  Math.abs(x.offset_along_cm - p.offset_along_cm) < 0.5 &&
                  Math.abs(x.width_cm - p.width_cm) < 0.5
              ) ?? rack?.passages?.[rack.passages.length - 1];
              if (created) {
                setSelectedPassage({ rackUuid: p.rackUuid, passageUuid: created.uuid });
              }
              return next;
            });
          }
        }
        passageDrawEndPendingRef.current = null;
        if (passageDrawEndRafRef.current != null) {
          cancelAnimationFrame(passageDrawEndRafRef.current);
          passageDrawEndRafRef.current = null;
        }
        setPassageDrawStart(null);
        setPassageDrawEnd(null);
      }
      setDraggingPassage(null);
    },
    [
      passageToolActive,
      passageDrawStart,
      passageDrawEnd,
      passageWidthCm,
      layout.racks,
      layout.grid_cols,
      layout.grid_rows,
      refs,
      setPassageDrawStart,
      setPassageDrawEnd,
      setLayout,
      setSelectedPassage,
      setDraggingPassage,
    ]
  );

  return { handleMouseDown, handleMouseMove, handleMouseUp };
}
