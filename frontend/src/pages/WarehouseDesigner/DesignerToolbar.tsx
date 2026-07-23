import { useState } from "react";
import { log } from "../../utils/logger";
import type { LayoutState } from "../../types/warehouse";
import { UI_STRINGS } from "../../constants/uiStrings";
import { clampGridToBuilding } from "../../components/warehouse/warehouseUtils";
import { useWarehouse } from "../../context/WarehouseContext";
import { EditBuildingModal } from "./EditBuildingModal";

export interface DesignerToolbarProps {
  mainView: "magazyn" | "layout";
  lastSavedAt: number | null;
  saveLayout: () => void;
  saving: boolean;
  /** When set, save is disabled (e.g. duplicate rack names). Shown as button title. */
  saveLayoutBlockedReason?: string | null;
  layout: LayoutState;
  setLayout: React.Dispatch<React.SetStateAction<LayoutState>>;
  /** Warehouse usage % (rack area / building area). When building not set, undefined. */
  warehouseUsagePct?: number | null;
  /** When provided, building modal is controlled by parent (e.g. so RackSidebar can open it). */
  showEditBuilding?: boolean;
  setShowEditBuilding?: (v: boolean) => void;
}

export function DesignerToolbar({
  mainView,
  lastSavedAt,
  saveLayout,
  saving,
  saveLayoutBlockedReason,
  layout,
  setLayout,
  warehouseUsagePct,
  showEditBuilding: showEditBuildingProp,
  setShowEditBuilding: setShowEditBuildingProp,
}: DesignerToolbarProps) {
  const { selectedWarehouseId } = useWarehouse();
  const [showEditBuildingLocal, setShowEditBuildingLocal] = useState(false);
  const showEditBuilding = setShowEditBuildingProp != null ? (showEditBuildingProp ?? false) : showEditBuildingLocal;
  const setShowEditBuilding = setShowEditBuildingProp ?? setShowEditBuildingLocal;

  const depthM = layout.building_depth_m ?? layout.building_height_m;
  const hasBuilding =
    layout.building_width_m != null && depthM != null && layout.building_width_m > 0 && depthM > 0;

  return (
    <>
      <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
        {warehouseUsagePct != null && hasBuilding && (
          <div
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200/70 bg-slate-50/95 px-2.5 py-1 shadow-sm shadow-slate-900/[0.03]"
            title="Zajętość powierzchni (regały / budynek)"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Zajętość</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200/90">
              <div
                className="h-1.5 rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, Number(warehouseUsagePct)))}%` }}
              />
            </div>
            <span className="min-w-[2.25rem] text-right text-[11px] font-semibold tabular-nums text-slate-700">
              {Number(warehouseUsagePct).toFixed(0)}%
            </span>
          </div>
        )}
        <span className={`inline-flex items-center rounded-md border border-slate-200/60 px-2 py-0.5 font-mono text-[10px] font-medium transition-colors duration-150 ${lastSavedAt != null ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`} title={lastSavedAt != null ? UI_STRINGS.warehouse.selector.savedToDb : UI_STRINGS.warehouse.selector.unsavedChanges}>
          {lastSavedAt != null ? UI_STRINGS.warehouse.selector.syncSaved : UI_STRINGS.warehouse.selector.notSaved}
        </span>
        {mainView === "layout" && (
          <button
            type="button"
            onClick={() => {
              if (selectedWarehouseId == null) {
                console.warn("No warehouse selected");
                return;
              }
              saveLayout();
            }}
            title={
              saveLayoutBlockedReason
                ? "Zapis zablokowany: zduplikowana nazwa regału (wyświetlimy komunikat po kliknięciu)."
                : undefined
            }
            disabled={saving || selectedWarehouseId == null}
            className={`h-8 rounded-lg px-3.5 text-[11px] font-semibold text-white shadow-sm transition-all duration-150 ${
              saveLayoutBlockedReason
                ? "bg-amber-600 hover:bg-amber-500 ring-1 ring-amber-400/80"
                : "bg-cyan-600 shadow-cyan-900/15 hover:bg-cyan-500 hover:shadow-md"
            } disabled:opacity-50 disabled:shadow-none`}
          >
            {saving ? UI_STRINGS.warehouse.rackSidebar.saving : UI_STRINGS.warehouse.rackSidebar.saveLayout}
          </button>
        )}
      </div>
      {showEditBuilding && (
        <EditBuildingModal
          onClose={() => setShowEditBuilding(false)}
          onSave={(building_width_m, building_depth_m, building_height_m) => {
            log("Saving building", {
              width: building_width_m,
              depth: building_depth_m,
              height: building_height_m,
            });
            setLayout((prev) => clampGridToBuilding({ ...prev, building_width_m, building_depth_m, building_height_m }));
          }}
          layout={layout}
        />
      )}
    </>
  );
}
