import type { LayoutState, WarehouseProduct } from "../../types/warehouse";
import type { InternalStructure, BinState } from "./warehouseTypes";
import { ElevationPanel } from "./ElevationPanel";
import { InternalLayoutModal } from "./InternalLayoutModal";
import { EditProductModal, type EditProductModalProps } from "./EditProductModal";
import { getRackDisplayId } from "./warehouseUtils";
import { UI_STRINGS } from "../../constants/uiStrings";

export type WarehouseModalsProps = {
  /** CreateWarehouseModal */
  showCreateWarehouse: boolean;
  onCloseCreateWarehouse: () => void;
  newWarehouseName: string;
  onNewWarehouseNameChange: (value: string) => void;
  onCreateWarehouse: () => void;

  /** Elevation side panel (fixed right-0 block with ElevationPanel) */
  mainView: "magazyn" | "layout";
  showElevationForRackId: number | string | null;
  layout: LayoutState;
  setShowElevationForRackId: (id: number | string | null) => void;
  setSelectedBinForFilter: (v: { level_index: number; segment_index: number } | null) => void;
  products: WarehouseProduct[];
  selectedBinForFilter: { level_index: number; segment_index: number } | null;
  setEditingProductId: (id: string | null) => void;

  /** InternalLayoutModal */
  internalLayoutRackId: number | string | null;
  onSaveInternalLayout: (internal_structure: InternalStructure, bins?: BinState[]) => void;
  onCloseInternalLayout: () => void;

  /** EditProductModal – when non-null, modal is visible and these are the props for EditProductModal */
  editProductModalProps: EditProductModalProps | null;

  /** Snackbar (bottom notification) */
  snackbar: { message: string; undo?: () => void; undoLabel?: string } | null;
  setSnackbar: (v: { message: string; undo?: () => void; undoLabel?: string } | null) => void;
};

export function WarehouseModals(props: WarehouseModalsProps) {
  const {
    showCreateWarehouse,
    onCloseCreateWarehouse,
    newWarehouseName,
    onNewWarehouseNameChange,
    onCreateWarehouse,
    mainView,
    showElevationForRackId,
    layout,
    setShowElevationForRackId,
    setSelectedBinForFilter,
    products,
    selectedBinForFilter,
    setEditingProductId,
    internalLayoutRackId,
    onSaveInternalLayout,
    onCloseInternalLayout,
    editProductModalProps,
    snackbar,
    setSnackbar,
  } = props;

  return (
    <>
      {showCreateWarehouse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCloseCreateWarehouse}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full border border-[#E2E8F0]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-[#1E293B] mb-2">{UI_STRINGS.warehouse.modal.newWarehouse}</h3>
            <input
              type="text"
              value={newWarehouseName}
              onChange={(e) => onNewWarehouseNameChange(e.target.value)}
              placeholder={UI_STRINGS.warehouse.modal.warehousePlaceholder}
              className="w-full rounded-lg border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-3 py-2 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={onCloseCreateWarehouse} className="px-3 py-2 rounded-lg bg-slate-100 text-[#1E293B] hover:bg-slate-200">{UI_STRINGS.warehouse.modal.cancel}</button>
              <button type="button" onClick={onCreateWarehouse} className="px-3 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500">{UI_STRINGS.warehouse.modal.create}</button>
            </div>
          </div>
        </div>
      )}

      {mainView === "layout" && showElevationForRackId != null && (() => {
        const rack = layout.racks.find((r) => (r.id ?? r.rack_index) === showElevationForRackId);
        return rack ? (
          <div className="fixed right-0 top-0 bottom-0 z-40 w-96 bg-white border-l border-[#E2E8F0] shadow-xl flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]">
              <h3 className="font-bold text-[#1E293B]">Widok z boku – {getRackDisplayId(rack)}</h3>
              <button type="button" onClick={() => { setShowElevationForRackId(null); setSelectedBinForFilter(null); }} className="p-2 rounded-lg hover:bg-slate-100 text-[#1E293B]">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <ElevationPanel rack={rack} products={products} selectedBinForFilter={selectedBinForFilter} setSelectedBinForFilter={setSelectedBinForFilter} onAddProduct={() => setEditingProductId("new")} onEditProduct={setEditingProductId} />
            </div>
          </div>
        ) : null;
      })()}

      {(mainView === "magazyn" || mainView === "layout") && internalLayoutRackId != null && (() => {
        const rack = layout.racks.find((r) => (r.id ?? r.rack_index) === internalLayoutRackId);
        return rack ? (
          <InternalLayoutModal
            rack={rack}
            onSave={onSaveInternalLayout}
            onClose={onCloseInternalLayout}
          />
        ) : null;
      })()}

      {editProductModalProps != null ? (
        <EditProductModal
          {...editProductModalProps}
        />
      ) : null}

      {snackbar && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-lg bg-white border border-[#E2E8F0] shadow-xl text-[#1E293B] text-sm">
          <span>{snackbar.message}</span>
          {snackbar.undo && (
            <button type="button" onClick={snackbar.undo} className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium">
              {snackbar.undoLabel ?? "Cofnij"}
            </button>
          )}
          <button type="button" onClick={() => setSnackbar(null)} className="text-slate-500 hover:text-slate-700">✕</button>
        </div>
      )}
    </>
  );
}
