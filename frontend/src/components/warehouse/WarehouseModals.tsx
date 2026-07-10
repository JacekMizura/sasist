import { warn } from "../../utils/logger";
import type { LayoutState } from "../../types/warehouse";
import type { InternalStructure, BinState } from "./warehouseTypes";
import { InternalLayoutModal } from "./InternalLayoutModal";
import { EditProductModal, type EditProductModalProps } from "./EditProductModal";
import { findRackForInternalLayoutModal } from "./warehouseUtils";
import { UI_STRINGS } from "../../constants/uiStrings";

export type WarehouseModalsProps = {
  /** CreateWarehouseModal */
  showCreateWarehouse: boolean;
  onCloseCreateWarehouse: () => void;
  newWarehouseName: string;
  onNewWarehouseNameChange: (value: string) => void;
  onCreateWarehouse: () => void;

  mainView: "magazyn" | "layout";
  layout: LayoutState;

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
    layout,
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

      {(mainView === "magazyn" || mainView === "layout") && internalLayoutRackId != null && (() => {
        const rack = findRackForInternalLayoutModal(layout, internalLayoutRackId);
        if (!rack) {
          warn("[WarehouseModals] internal layout: rack not found for id", internalLayoutRackId, {
            rackKeys: layout.racks.map((r) => ({ id: r.id, rack_index: r.rack_index, uuid: r.uuid })),
          });
        }
        return rack ? (
          <InternalLayoutModal
            layout={layout}
            rack={rack}
            warehouseLabel={layout.warehouse_name || undefined}
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
