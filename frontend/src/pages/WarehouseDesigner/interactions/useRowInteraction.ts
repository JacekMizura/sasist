import { useCallback, useEffect } from "react";
import type { CatalogItem, LayoutState, RowContainer } from "../../../types/warehouse";
import { getCellFromClientPosition } from "../utils/designerMouseUtils";

export interface UseRowInteractionParams {
  layout: LayoutState;
  rowToolActive: boolean;
  rowDrawStart: { x: number; y: number } | null;
  rowDrawEnd: { x: number; y: number } | null;
  rowToolTemplate: CatalogItem | null;
  draggingRowId: string | null;
  rowDragPreviewStart: { x: number; y: number } | null;
  showDimensions: boolean;
  refs: {
    rowDragPointerOffsetRef: React.MutableRefObject<{ dx: number; dy: number } | null>;
    rowDragPreviewStartRef: React.MutableRefObject<{ x: number; y: number } | null>;
    rowDrawEndPendingRef: React.MutableRefObject<{ x: number; y: number } | null>;
    rowDrawEndRafRef: React.MutableRefObject<number | null>;
    rowDrawTemplateRef: React.MutableRefObject<CatalogItem | null>;
    placeRowWithTemplateRef: React.MutableRefObject<((start: { x: number; y: number }, end: { x: number; y: number }, item: CatalogItem) => void) | null>;
    placeEmptyRowRef: React.MutableRefObject<((start: { x: number; y: number }, end: { x: number; y: number }) => void) | null>;
    canMoveRowToRef: React.MutableRefObject<((rowId: string, newStart: { x: number; y: number }) => boolean) | null>;
    moveRowToPositionRef: React.MutableRefObject<((rowId: string, newStartX: number, newStartY: number) => void) | null>;
    lastMouseRef: React.MutableRefObject<{ clientX: number; clientY: number } | null>;
    svgRef: React.RefObject<SVGSVGElement | null>;
  };
  getCellFromEvent: (e: { clientX: number; clientY: number }) => { x: number; y: number } | null;
  snapRowPreviewToDistance: (row: RowContainer, pos: { x: number; y: number }, layout: LayoutState) => { x: number; y: number };
  setRowDrawStart: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  setRowDrawEnd: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  setRowPreviewCursor: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  setRowDragPreviewStart: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  setDraggingRowId: React.Dispatch<React.SetStateAction<string | null>>;
  setRowToolTemplate: React.Dispatch<React.SetStateAction<CatalogItem | null>>;
}

export function useRowInteraction(params: UseRowInteractionParams) {
  const {
    layout,
    rowToolActive,
    rowDrawStart,
    rowDrawEnd,
    rowToolTemplate,
    draggingRowId,
    rowDragPreviewStart,
    showDimensions,
    refs,
    getCellFromEvent,
    snapRowPreviewToDistance: snapRowPreview,
    setRowDrawStart,
    setRowDrawEnd,
    setRowPreviewCursor,
    setRowDragPreviewStart,
    setDraggingRowId,
  } = params;
  const {
    rowDragPointerOffsetRef,
    rowDragPreviewStartRef,
    rowDrawEndPendingRef,
    rowDrawEndRafRef,
    rowDrawTemplateRef,
    placeRowWithTemplateRef,
    placeEmptyRowRef,
    canMoveRowToRef,
    moveRowToPositionRef,
    lastMouseRef,
    svgRef,
  } = refs;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, cell: { x: number; y: number }) => {
      if (rowToolActive && e.button === 0) {
        if (!rowDrawStart) {
          rowDrawTemplateRef.current = rowToolTemplate?.type === "custom"
            ? { type: "custom" as const, template: { ...rowToolTemplate.template } }
            : rowToolTemplate ?? null;
          setRowDrawStart(cell);
          setRowDrawEnd(cell);
        }
        return true;
      }
      return false;
    },
    [rowToolActive, rowDrawStart, rowToolTemplate, rowDrawTemplateRef, setRowDrawStart, setRowDrawEnd]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>, cell: { x: number; y: number } | null) => {
      if (draggingRowId != null && rowDragPointerOffsetRef.current && cell) {
        const { dx, dy } = rowDragPointerOffsetRef.current;
        let px = Math.max(0, Math.min(layout.grid_cols - 1, Math.round(cell.x - dx)));
        let py = Math.max(0, Math.min(layout.grid_rows - 1, Math.round(cell.y - dy)));
        if (showDimensions) {
          const row = layout.row_containers?.find((rc) => rc.id === draggingRowId);
          if (row) {
            const snapped = snapRowPreview(row, { x: px, y: py }, layout);
            px = snapped.x;
            py = snapped.y;
          }
        }
        setRowDragPreviewStart((prev) => (prev?.x === px && prev?.y === py ? prev : { x: px, y: py }));
        rowDragPreviewStartRef.current = { x: px, y: py };
      }
      if (rowToolActive && rowDrawStart && cell) {
        setRowPreviewCursor({ x: e.clientX, y: e.clientY });
        rowDrawEndPendingRef.current = cell;
        if (rowDrawEndRafRef.current == null) {
          rowDrawEndRafRef.current = requestAnimationFrame(() => {
            rowDrawEndRafRef.current = null;
            const pending = rowDrawEndPendingRef.current;
            if (pending) setRowDrawEnd((prev) => (prev?.x === pending.x && prev?.y === pending.y ? prev : pending));
          });
        }
      }
    },
    [
      draggingRowId,
      rowToolActive,
      rowDrawStart,
      layout,
      showDimensions,
      snapRowPreview,
      rowDragPointerOffsetRef,
      rowDragPreviewStartRef,
      rowDrawEndPendingRef,
      rowDrawEndRafRef,
      setRowDragPreviewStart,
      setRowDrawEnd,
      setRowPreviewCursor,
    ]
  );

  const handleMouseUp = useCallback(() => {
    const templateAtDrawStart = rowDrawTemplateRef.current;
    if (rowToolActive && rowDrawStart) {
      let end = rowDrawEndPendingRef.current ?? rowDrawEnd;
      if (end == null && lastMouseRef.current && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        end = getCellFromClientPosition(
          lastMouseRef.current.clientX,
          lastMouseRef.current.clientY,
          rect,
          layout.grid_cols,
          layout.grid_rows
        );
      }
      if (end) {
        const activeTemplate = templateAtDrawStart ?? rowToolTemplate;
        const placeRowWithTemplate = placeRowWithTemplateRef.current;
        const placeEmptyRow = placeEmptyRowRef.current;
        if (activeTemplate && placeRowWithTemplate) {
          placeRowWithTemplate(rowDrawStart, end, activeTemplate);
        } else if (placeEmptyRow) {
          placeEmptyRow(rowDrawStart, end);
        }
      }
      rowDrawTemplateRef.current = null;
      rowDrawEndPendingRef.current = null;
      if (rowDrawEndRafRef.current != null) {
        cancelAnimationFrame(rowDrawEndRafRef.current);
        rowDrawEndRafRef.current = null;
      }
      setRowDrawStart(null);
      setRowDrawEnd(null);
      setRowPreviewCursor(null);
    }
    const canMoveRowTo = canMoveRowToRef.current;
    const moveRowToPosition = moveRowToPositionRef.current;
    if (draggingRowId != null && rowDragPreviewStart != null && canMoveRowTo && moveRowToPosition) {
      if (canMoveRowTo(draggingRowId, rowDragPreviewStart)) {
        moveRowToPosition(draggingRowId, rowDragPreviewStart.x, rowDragPreviewStart.y);
      }
      setDraggingRowId(null);
      setRowDragPreviewStart(null);
      rowDragPointerOffsetRef.current = null;
    }
  }, [
    rowToolActive,
    rowDrawStart,
    rowDrawEnd,
    rowToolTemplate,
    draggingRowId,
    rowDragPreviewStart,
    layout.grid_cols,
    layout.grid_rows,
    refs,
    setRowDrawStart,
    setRowDrawEnd,
    setRowPreviewCursor,
    setDraggingRowId,
    setRowDragPreviewStart,
  ]);

  useEffect(() => {
    if (!draggingRowId) return;
    const onWindowMouseMove = (ev: MouseEvent) => {
      const cell = getCellFromEvent(ev);
      if (!cell || !rowDragPointerOffsetRef.current) return;
      const { dx, dy } = rowDragPointerOffsetRef.current;
      let px = Math.max(0, Math.min(layout.grid_cols - 1, Math.round(cell.x - dx)));
      let py = Math.max(0, Math.min(layout.grid_rows - 1, Math.round(cell.y - dy)));
      if (showDimensions) {
        const row = layout.row_containers?.find((rc) => rc.id === draggingRowId);
        if (row) {
          const snapped = snapRowPreview(row, { x: px, y: py }, layout);
          px = snapped.x;
          py = snapped.y;
        }
      }
      setRowDragPreviewStart((prev) => (prev?.x === px && prev?.y === py ? prev : { x: px, y: py }));
      rowDragPreviewStartRef.current = { x: px, y: py };
    };
    const onWindowMouseUp = () => {
      const preview = rowDragPreviewStartRef.current;
      const canMoveRowTo = canMoveRowToRef.current;
      const moveRowToPosition = moveRowToPositionRef.current;
      if (draggingRowId && preview != null && canMoveRowTo && moveRowToPosition) {
        if (canMoveRowTo(draggingRowId, preview)) {
          moveRowToPosition(draggingRowId, preview.x, preview.y);
        }
        setDraggingRowId(null);
        setRowDragPreviewStart(null);
        rowDragPointerOffsetRef.current = null;
        rowDragPreviewStartRef.current = null;
      }
    };
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, [draggingRowId, getCellFromEvent, layout, showDimensions, snapRowPreview, refs, setRowDragPreviewStart, setDraggingRowId]);

  return { handleMouseDown, handleMouseMove, handleMouseUp };
}
