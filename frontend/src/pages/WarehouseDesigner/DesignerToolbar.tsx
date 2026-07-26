import { useState } from "react";
import { log } from "../../utils/logger";
import type { LayoutState } from "../../types/warehouse";
import { UI_STRINGS } from "../../constants/uiStrings";
import { clampGridToBuilding } from "../../components/warehouse/warehouseUtils";
import { useWarehouse } from "../../context/WarehouseContext";
import { Card, PrimaryButton, ProgressBar, StatusText, typography } from "../../design-system";
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
  /**
   * When false, omit save-status text (parent renders it before the warehouse select).
   * Default true for backward compatibility.
   */
  showSaveStatus?: boolean;
}

/** Subtle plain-text save status (no badge chrome). */
export function DesignerSaveStatusText({ lastSavedAt }: { lastSavedAt: number | null }) {
  const saved = lastSavedAt != null;
  return (
    <StatusText
      tone={saved ? "success" : "warning"}
      title={saved ? UI_STRINGS.warehouse.selector.savedToDb : UI_STRINGS.warehouse.selector.unsavedChanges}
    >
      {saved ? UI_STRINGS.warehouse.selector.syncSaved : UI_STRINGS.warehouse.selector.notSaved}
    </StatusText>
  );
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
  showSaveStatus = true,
}: DesignerToolbarProps) {
  const { selectedWarehouseId } = useWarehouse();
  const [showEditBuildingLocal, setShowEditBuildingLocal] = useState(false);
  const showEditBuilding = setShowEditBuildingProp != null ? (showEditBuildingProp ?? false) : showEditBuildingLocal;
  const setShowEditBuilding = setShowEditBuildingProp ?? setShowEditBuildingLocal;

  const depthM = layout.building_depth_m ?? layout.building_height_m;
  const hasBuilding =
    layout.building_width_m != null && depthM != null && layout.building_width_m > 0 && depthM > 0;

  const runSave = () => {
    if (selectedWarehouseId == null) {
      console.warn("No warehouse selected");
      return;
    }
    saveLayout();
  };

  return (
    <>
      <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
        {warehouseUsagePct != null && hasBuilding && (
          <Card
            variant="section"
            density="compact"
            className="!flex !flex-row !items-center gap-2 !p-2"
            title="Zajętość powierzchni (regały / budynek)"
          >
            <span className={typography.label}>Zajętość</span>
            <ProgressBar value={Number(warehouseUsagePct)} className="w-24" />
            <span className={`min-w-[2.25rem] text-right tabular-nums ${typography.controlMicro}`}>
              {Number(warehouseUsagePct).toFixed(0)}%
            </span>
          </Card>
        )}
        {showSaveStatus ? <DesignerSaveStatusText lastSavedAt={lastSavedAt} /> : null}
        {mainView === "layout" && (
          <PrimaryButton
            type="button"
            intent={saveLayoutBlockedReason ? "warning" : "brand"}
            onClick={runSave}
            disabled={saving || selectedWarehouseId == null}
            title={
              saveLayoutBlockedReason
                ? "Zapis zablokowany: zduplikowana nazwa regału (wyświetlimy komunikat po kliknięciu)."
                : undefined
            }
          >
            {saving ? UI_STRINGS.warehouse.rackSidebar.saving : UI_STRINGS.warehouse.rackSidebar.saveLayout}
          </PrimaryButton>
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
