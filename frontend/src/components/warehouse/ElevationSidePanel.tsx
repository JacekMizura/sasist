import type { ReactNode } from "react";
import type { LayoutState, WarehouseProduct } from "../../types/warehouse";
import { ElevationPanel } from "./ElevationPanel";
import { getRackDisplayId } from "./warehouseUtils";
import { AppRightPanel } from "../layout/app";

export type ElevationSidePanelProps = {
  layout: LayoutState;
  rackId: number | string;
  products: WarehouseProduct[];
  selectedBinForFilter: { level_index: number; segment_index: number } | null;
  setSelectedBinForFilter: (v: { level_index: number; segment_index: number } | null) => void;
  onClose: () => void;
  onAddProduct: () => void;
  onEditProduct: (id: string) => void;
};

/** In-flow elevation panel (replaces fixed overlay in WarehouseModals). */
export function ElevationSidePanel({
  layout,
  rackId,
  products,
  selectedBinForFilter,
  setSelectedBinForFilter,
  onClose,
  onAddProduct,
  onEditProduct,
}: ElevationSidePanelProps) {
  const rack = layout.racks.find((r) => (r.id ?? r.rack_index) === rackId);
  if (!rack) return null;

  return (
    <AppRightPanel
      open
      onClose={onClose}
      title={`Widok z boku – ${getRackDisplayId(rack, layout)}`}
      aria-label="Widok z boku regału"
    >
      <div className="p-4">
        <ElevationPanel
          layout={layout}
          rack={rack}
          products={products}
          selectedBinForFilter={selectedBinForFilter}
          setSelectedBinForFilter={setSelectedBinForFilter}
          onAddProduct={onAddProduct}
          onEditProduct={onEditProduct}
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
    <AppRightPanel open bare aria-label="Element wizualny">
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
