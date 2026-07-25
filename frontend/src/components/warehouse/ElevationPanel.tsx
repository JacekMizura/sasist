import type { LayoutState, RackState, WarehouseProduct } from "../../types/warehouse";
import { RackLocationsSection } from "./RackLocationsSection";

/**
 * Legacy elevation content — now a thin wrapper over RackLocationsSection.
 * Product add/edit removed from the warehouse designer.
 */
export function ElevationPanel({
  layout,
  rack,
  selectedBinForFilter,
  setSelectedBinForFilter,
}: {
  layout?: LayoutState | null;
  rack: RackState;
  products?: WarehouseProduct[];
  selectedBinForFilter: { level_index: number; segment_index: number } | null;
  setSelectedBinForFilter: (v: { level_index: number; segment_index: number } | null) => void;
  onAddProduct?: () => void;
  onEditProduct?: (productId: string) => void;
}) {
  return (
    <RackLocationsSection
      layout={layout ?? ({ racks: [rack] } as LayoutState)}
      rack={rack}
      selectedBin={selectedBinForFilter}
      onSelectedBinChange={setSelectedBinForFilter}
    />
  );
}
