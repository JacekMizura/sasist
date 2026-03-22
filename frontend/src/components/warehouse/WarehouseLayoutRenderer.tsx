import type React from "react";
import { WarehouseCanvas, type WarehouseCanvasProps } from "./WarehouseCanvas";

export type WarehouseLayoutRendererMode = "edit" | "read";

export type WarehouseLayoutRendererProps = WarehouseCanvasProps & {
  mode: WarehouseLayoutRendererMode;
  /** Racks to highlight (e.g. product locator). Values are String(rack.id ?? rack.rack_index). */
  highlightedRackIds?: Set<string>;
  /** Click a rack (read mode): highlight/select rack. */
  onRackClick?: (rackId: number | string) => void;
  /** Double click a rack (read mode): open rack detail. */
  onRackDoubleClick?: (rackId: number | string) => void;
  /** Click map background (read mode): clear selection. */
  onReadModeCanvasBackgroundClick?: (e: React.MouseEvent<SVGSVGElement>) => void;
};

export function WarehouseLayoutRenderer({
  mode,
  highlightedRackIds,
  onRackClick,
  onRackDoubleClick,
  onReadModeCanvasBackgroundClick,
  ...canvasProps
}: WarehouseLayoutRendererProps) {
  return (
    <WarehouseCanvas
      {...canvasProps}
      mode={mode}
      highlightedRackIds={highlightedRackIds}
      onRackClick={onRackClick}
      onRackDoubleClick={onRackDoubleClick}
      onReadModeCanvasBackgroundClick={onReadModeCanvasBackgroundClick}
    />
  );
}

