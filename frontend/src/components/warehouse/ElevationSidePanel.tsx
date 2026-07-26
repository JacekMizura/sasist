import type { ReactNode } from "react";
import type { LayoutState, WarehouseProduct } from "../../types/warehouse";
import { ElevationPanel } from "./ElevationPanel";
import { getRackDisplayId, rackMatchesSlotRackId } from "./warehouseUtils";
import { AppRightPanel } from "../layout/app";
import { warehouseRightRailShellClass } from "../../design-system";

export type ElevationSidePanelProps = {
  layout: LayoutState;
  rackId: number | string;
  products?: WarehouseProduct[];
  selectedBinForFilter: { level_index: number; segment_index: number } | null;
  setSelectedBinForFilter: (v: { level_index: number; segment_index: number } | null) => void;
  onClose: () => void;
  onAddProduct?: () => void;
  onEditProduct?: (id: string) => void;
};

/** In-flow elevation panel (legacy). Prefer unified RackPropertiesSidebar. */
export function ElevationSidePanel({
  layout,
  rackId,
  selectedBinForFilter,
  setSelectedBinForFilter,
  onClose,
}: ElevationSidePanelProps) {
  const rack = layout.racks.find((r) => rackMatchesSlotRackId(r, rackId));
  if (!rack) return null;

  return (
    <AppRightPanel
      open
      onClose={onClose}
      title={`Właściwości – ${getRackDisplayId(rack, layout)}`}
      aria-label="Właściwości regału"
    >
      <div className="p-4">
        <ElevationPanel
          layout={layout}
          rack={rack}
          selectedBinForFilter={selectedBinForFilter}
          setSelectedBinForFilter={setSelectedBinForFilter}
        />
      </div>
    </AppRightPanel>
  );
}

/** Visual-element editor — same width tokens as rack properties panel. */
export function VisualElementPanelShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <AppRightPanel open bare aria-label="Element wizualny" className={warehouseRightRailShellClass}>
      <div
        className={["min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4", className ?? ""]
          .filter(Boolean)
          .join(" ")}
        style={{ overscrollBehavior: "contain" }}
      >
        {children}
      </div>
    </AppRightPanel>
  );
}
