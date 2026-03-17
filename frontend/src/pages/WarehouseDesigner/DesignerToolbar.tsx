import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { LayoutState } from "../../types/warehouse";
import { UI_STRINGS } from "../../constants/uiStrings";
import { clampGridToBuilding } from "../../components/warehouse/warehouseUtils";
import { EditBuildingModal } from "./EditBuildingModal";

export interface DesignerToolbarProps {
  mainView: "magazyn" | "layout";
  setMainView: (v: "magazyn" | "layout") => void;
  setEditingProductId: (v: React.SetStateAction<string | null>) => void;
  warehouses: { id: number; name: string }[];
  selectedWarehouseId: number | null;
  setSelectedWarehouseId: (v: number | null) => void;
  warehouseName: string;
  lastSavedAt: number | null;
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
  setMainView,
  setEditingProductId,
  warehouses,
  selectedWarehouseId,
  setSelectedWarehouseId,
  warehouseName,
  lastSavedAt,
  layout,
  setLayout,
  warehouseUsagePct,
  showEditBuilding: showEditBuildingProp,
  setShowEditBuilding: setShowEditBuildingProp,
}: DesignerToolbarProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showEditBuildingLocal, setShowEditBuildingLocal] = useState(false);
  const showEditBuilding = setShowEditBuildingProp != null ? (showEditBuildingProp ?? false) : showEditBuildingLocal;
  const setShowEditBuilding = setShowEditBuildingProp ?? setShowEditBuildingLocal;

  const depthM = layout.building_depth_m ?? layout.building_height_m;
  const hasBuilding =
    layout.building_width_m != null && depthM != null && layout.building_width_m > 0 && depthM > 0;

  return (
    <>
      <nav className="flex rounded-xl bg-slate-100 p-0.5 border border-slate-100 shadow-sm" aria-label="Tryby">
        <button
          type="button"
          onClick={() => { setMainView("magazyn"); setEditingProductId(null); const next = new URLSearchParams(searchParams); next.delete("view"); setSearchParams(next); }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${mainView === "magazyn" ? "bg-cyan-600 text-white" : "text-slate-600 hover:bg-slate-200"}`}
        >
          {UI_STRINGS.warehouse.designerSubTabs.magazyn}
        </button>
        <button
          type="button"
          onClick={() => { setMainView("layout"); const next = new URLSearchParams(searchParams); next.set("view", "layout"); setSearchParams(next); }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${mainView === "layout" ? "bg-cyan-600 text-white" : "text-slate-600 hover:bg-slate-200"}`}
        >
          {UI_STRINGS.warehouse.designerSubTabs.layoutDesigner}
        </button>
      </nav>
      <div className="flex items-center gap-3 flex-wrap">
        {warehouseUsagePct != null && hasBuilding && (
          <div className="flex items-center gap-2" title="Zajętość powierzchni (regały / budynek)">
            <span className="text-sm text-slate-600">Zajętość</span>
            <div className="w-32 h-2 bg-slate-200 rounded overflow-hidden">
              <div
                className="h-2 bg-emerald-500 rounded"
                style={{ width: `${Math.min(100, Math.max(0, Number(warehouseUsagePct)))}%` }}
              />
            </div>
            <span className="text-sm text-slate-600 min-w-[2rem]">
              {Number(warehouseUsagePct).toFixed(0)}%
            </span>
          </div>
        )}
        <select
          value={selectedWarehouseId ?? ""}
          onChange={(e) => setSelectedWarehouseId(e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2 min-w-[200px] focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
        >
          <option value="">{UI_STRINGS.warehouse.selector.selectWarehouse}</option>
          {warehouses.map((wh) => (
            <option key={wh.id} value={wh.id}>{wh.name}</option>
          ))}
        </select>
        <span className={`text-xs font-mono px-2 py-1 rounded ${lastSavedAt != null ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`} title={lastSavedAt != null ? UI_STRINGS.warehouse.selector.savedToDb : UI_STRINGS.warehouse.selector.unsavedChanges}>
          {lastSavedAt != null ? UI_STRINGS.warehouse.selector.syncSaved : UI_STRINGS.warehouse.selector.notSaved}
        </span>
      </div>
      {showEditBuilding && (
        <EditBuildingModal
          onClose={() => setShowEditBuilding(false)}
          onSave={(building_width_m, building_depth_m, building_height_m) => {
            console.log("Saving building", {
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
