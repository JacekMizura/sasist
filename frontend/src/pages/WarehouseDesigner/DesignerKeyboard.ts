import { useEffect } from "react";
import type { LayoutState, RackState, VisualElementState } from "../../types/warehouse";
import { cmToCells, duplicateRacksAtPosition, assignUniqueRackNamesToNewRacks, getNextRackIndex } from "../../components/warehouse/warehouseUtils";
import { LayoutMode } from "../../warehouse-layout";

export interface UseDesignerKeyboardParams {
  placementMode: boolean;
  setRackRotation: (v: React.SetStateAction<"vertical" | "horizontal">) => void;
  setPlacementMode: (v: boolean) => void;
  setLayoutMode: (v: React.SetStateAction<LayoutMode>) => void;
  setGhostPosition: (v: React.SetStateAction<{ x: number; y: number } | null>) => void;
  setRowToolTemplate: (v: React.SetStateAction<import("../../types/warehouse").CatalogItem | null>) => void;
  setRowDrawStart: (v: React.SetStateAction<{ x: number; y: number } | null>) => void;
  setRowDrawEnd: (v: React.SetStateAction<{ x: number; y: number } | null>) => void;
  setSelectedRowContainerId: (v: React.SetStateAction<string | null>) => void;
  setSelectedRowContainerIds: (v: React.SetStateAction<string[]>) => void;
  setSelectedRackId: (v: React.SetStateAction<number | string | null>) => void;
  setSelectedRackIds: (v: React.SetStateAction<Array<number | string>>) => void;
  setSelectedVisualId: (v: React.SetStateAction<string | null>) => void;
  setSelectedVisualIds: (v: React.SetStateAction<string[]>) => void;
  setMarqueeStart: (v: React.SetStateAction<{ x: number; y: number } | null>) => void;
  setMarqueeEnd: (v: React.SetStateAction<{ x: number; y: number } | null>) => void;
  setAisleDrawStart: (v: React.SetStateAction<{ x: number; y: number } | null>) => void;
  setClipboard: (v: React.SetStateAction<RackState[]>) => void;
  setLayout: React.Dispatch<React.SetStateAction<LayoutState>>;
  setSnackbar: (v: React.SetStateAction<{ message: string; undo?: () => void; undoLabel?: string } | null>) => void;
  mainView: "magazyn" | "layout";
  selectedRowContainerId: string | null;
  deleteSelectedRow: () => void;
  selectedObjectId: string | null;
  deleteObject: (objectId: string | null) => void;
  clipboard: RackState[];
  getPastePosition: () => { x: number; y: number };
  layout: LayoutState;
  selectedRackIds: Array<number | string>;
  selectedVisualIds: string[];
  copyPlacementMode?: boolean;
  setCopyPlacementMode?: (v: boolean) => void;
  setCopiedRack?: (v: RackState | null) => void;
  selectedWallElementId?: string | null;
  deleteSelectedWallElement?: () => void;
  internalLayoutRackId?: number | string | null;
  onCloseInternalLayout?: () => void;
  onCloseRackPanel?: () => void;
  rackPanelOpen?: boolean;
}

export function useDesignerKeyboard(params: UseDesignerKeyboardParams): void {
  const {
    placementMode,
    setRackRotation,
    setPlacementMode,
    setLayoutMode,
    setGhostPosition,
    setRowToolTemplate,
    setRowDrawStart,
    setRowDrawEnd,
    setSelectedRowContainerId,
    setSelectedRowContainerIds,
    setSelectedRackId,
    setSelectedRackIds,
    setSelectedVisualId,
    setSelectedVisualIds,
    setMarqueeStart,
    setMarqueeEnd,
    setAisleDrawStart,
    setClipboard,
    setLayout,
    setSnackbar,
    mainView,
    selectedRowContainerId,
    deleteSelectedRow,
    selectedObjectId,
    deleteObject,
    clipboard,
    getPastePosition,
    layout,
    selectedRackIds,
    selectedVisualIds,
  copyPlacementMode = false,
  setCopyPlacementMode,
  setCopiedRack,
  selectedWallElementId = null,
  deleteSelectedWallElement,
  internalLayoutRackId = null,
  onCloseInternalLayout,
  onCloseRackPanel,
  rackPanelOpen = false,
  } = params;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const inInput = document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || (document.activeElement as HTMLElement).isContentEditable);
        if (inInput) return;
        if (mainView === "layout" && selectedRowContainerId && deleteSelectedRow) {
          e.preventDefault();
          deleteSelectedRow();
          return;
        }
        if (selectedWallElementId && deleteSelectedWallElement) {
          e.preventDefault();
          deleteSelectedWallElement();
          return;
        }
        if (!selectedObjectId) return;
        if (mainView !== "magazyn") {
          e.preventDefault();
          deleteObject(selectedObjectId);
        }
      }
      if (e.code === "Space" || e.key === "r" || e.key === "R") {
        e.preventDefault();
        if (placementMode) setRackRotation((prev) => (prev === "vertical" ? "horizontal" : "vertical"));
      }
      if (e.key === "Escape") {
        if (internalLayoutRackId != null && onCloseInternalLayout) {
          e.preventDefault();
          onCloseInternalLayout();
          return;
        }
        if (rackPanelOpen && onCloseRackPanel) {
          e.preventDefault();
          onCloseRackPanel();
          return;
        }
        if (copyPlacementMode && setCopyPlacementMode && setCopiedRack) {
          setCopyPlacementMode(false);
          setCopiedRack(null);
          setGhostPosition(null);
          return;
        }
        setPlacementMode(false);
        setLayoutMode(LayoutMode.SELECT);
        setGhostPosition(null);
        setRowToolTemplate(null);
        setRowDrawStart(null);
        setRowDrawEnd(null);
        setSelectedRowContainerId(null);
        setSelectedRowContainerIds([]);
        setSelectedRackId(null);
        setSelectedRackIds([]);
        setSelectedVisualId(null);
        setSelectedVisualIds([]);
        setMarqueeStart(null);
        setMarqueeEnd(null);
        setAisleDrawStart(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        if (selectedRackIds.length > 0) {
          e.preventDefault();
          setClipboard(layout.racks.filter((r) => selectedRackIds.includes(r.id ?? r.rack_index)));
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (clipboard.length > 0) {
          e.preventDefault();
          const pos = getPastePosition();
          const cell = { x: cmToCells(pos.x), y: cmToCells(pos.y) };
          setLayout((prev) => ({
            ...prev,
            racks: [...prev.racks, ...duplicateRacksAtPosition(clipboard, cell, getNextRackIndex(prev.racks))],
          }));
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        if (mainView !== "magazyn" && selectedRackIds.length > 0) {
          const toDup = layout.racks.filter((r) => selectedRackIds.includes(r.id ?? r.rack_index));
          if (toDup.length > 0) {
            const pos = getPastePosition();
            const cell = { x: cmToCells(pos.x), y: cmToCells(pos.y) };
            setLayout((prev) => ({
              ...prev,
              racks: [
                ...prev.racks,
                ...assignUniqueRackNamesToNewRacks(duplicateRacksAtPosition(toDup, cell, getNextRackIndex(prev.racks)), prev),
              ],
            }));
            setSnackbar({ message: "Sklonowano regały.", undo: () => setSnackbar(null) });
          }
        } else if (mainView !== "magazyn" && selectedVisualIds.length > 0) {
          const toDup = (layout.visual_elements ?? []).filter((ve) => selectedVisualIds.includes(ve.id));
          if (toDup.length > 0) {
            const pos = getPastePosition();
            const cx = cmToCells(pos.x);
            const cy = cmToCells(pos.y);
            const newEls: VisualElementState[] = toDup.map((ve, i) => ({
              ...ve,
              id: `ve-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
              x: cx + (i % 2) * 2,
              y: cy + Math.floor(i / 2) * 2,
            }));
            setLayout((prev) => ({ ...prev, visual_elements: [...(prev.visual_elements ?? []), ...newEls] }));
            setSelectedVisualIds(newEls.map((e) => e.id));
            setSelectedVisualId(newEls[0]?.id ?? null);
            setSnackbar({ message: "Sklonowano elementy.", undo: () => setSnackbar(null) });
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placementMode, selectedObjectId, deleteObject, deleteSelectedRow, clipboard, getPastePosition, layout.racks, layout.visual_elements, mainView, selectedRackIds.length, selectedRowContainerId, selectedVisualIds.length, copyPlacementMode, setCopyPlacementMode, setCopiedRack, selectedWallElementId, deleteSelectedWallElement, internalLayoutRackId, onCloseInternalLayout, onCloseRackPanel, rackPanelOpen]);
}
