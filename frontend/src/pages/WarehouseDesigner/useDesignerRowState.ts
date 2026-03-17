import { useState } from "react";
import type { CatalogItem } from "../../types/warehouse";
import { DEFAULT_AISLE_WIDTH_CM } from "./DesignerRackPlacement";

export function useDesignerRowState() {
  const [aisleDrawStart, setAisleDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [rowToolTemplate, setRowToolTemplate] = useState<CatalogItem | null>(null);
  const [rowDrawStart, setRowDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [rowDrawEnd, setRowDrawEnd] = useState<{ x: number; y: number } | null>(null);
  const [rowPreviewCursor, setRowPreviewCursor] = useState<{ x: number; y: number } | null>(null);
  const [rowGapCm, setRowGapCm] = useState(0);
  const [selectedRowContainerId, setSelectedRowContainerId] = useState<string | null>(null);
  const [selectedRowContainerIds, setSelectedRowContainerIds] = useState<string[]>([]);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [rowDragPreviewStart, setRowDragPreviewStart] = useState<{ x: number; y: number } | null>(null);
  const [catalogHoveredSlot, setCatalogHoveredSlot] = useState<{ rowId: string; slotIndex: number } | null>(null);
  const [aisleWidthCm, setAisleWidthCm] = useState(DEFAULT_AISLE_WIDTH_CM);

  return {
    aisleDrawStart,
    setAisleDrawStart,
    rowToolTemplate,
    setRowToolTemplate,
    rowDrawStart,
    setRowDrawStart,
    rowDrawEnd,
    setRowDrawEnd,
    rowPreviewCursor,
    setRowPreviewCursor,
    rowGapCm,
    setRowGapCm,
    selectedRowContainerId,
    setSelectedRowContainerId,
    selectedRowContainerIds,
    setSelectedRowContainerIds,
    draggingRowId,
    setDraggingRowId,
    rowDragPreviewStart,
    setRowDragPreviewStart,
    catalogHoveredSlot,
    setCatalogHoveredSlot,
    aisleWidthCm,
    setAisleWidthCm,
  };
}
