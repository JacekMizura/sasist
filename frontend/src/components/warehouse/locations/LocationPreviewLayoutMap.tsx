import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogItem, LayoutState, RackState, VisualElementType } from "../../../types/warehouse";
import { WarehouseLayoutRenderer } from "../WarehouseLayoutRenderer";
import { getRackDisplayId } from "../warehouseUtils";
import { layoutService } from "../../../services/layoutService";
import { layoutStateFromWarehouseApiPayload } from "../../../pages/Products/layoutStateFromWarehouseApi";
import {
  BASE_PX_PER_CELL,
  DEFAULT_ROW_SLOT_H,
  DEFAULT_ROW_SLOT_W,
  rectsOverlap,
  snapPosition,
} from "../../../pages/WarehouseDesigner/DesignerRackPlacement";
import { useDesignerCanvas } from "../../../pages/WarehouseDesigner/useDesignerCanvas";
import { getCellFromWarehouseLayoutSvg } from "../../../pages/WarehouseDesigner/utils/designerMouseUtils";

function getDefaultVisualSize(type: VisualElementType): { w: number; h: number } {
  switch (type) {
    case "column":
      return { w: 2, h: 2 };
    case "mezzanine":
      return { w: 20, h: 15 };
    case "packing_station":
      return { w: 6, h: 4 };
    case "cart":
      return { w: 3, h: 3 };
    case "wall":
      return { w: 10, h: 1 };
    case "door":
      return { w: 2, h: 3 };
    case "zone":
      return { w: 8, h: 6 };
    default:
      return { w: 2, h: 2 };
  }
}

type Props = {
  tenantId: number;
  warehouseId: number;
  locationUuid?: string | null;
  activeRackId?: number | null;
  className?: string;
  onRackFocus?: (rackId: number) => void;
  /** When provided, skips internal layout fetch (shared with rack side view). */
  layout?: LayoutState | null;
  layoutLoading?: boolean;
  layoutError?: string | null;
};

export function LocationPreviewLayoutMap({
  tenantId,
  warehouseId,
  locationUuid,
  activeRackId,
  className = "",
  onRackFocus,
  layout: layoutProp,
  layoutLoading: layoutLoadingProp,
  layoutError: layoutErrorProp,
}: Props) {
  const [layoutLocal, setLayoutLocal] = useState<LayoutState | null>(null);
  const [loadErrorLocal, setLoadErrorLocal] = useState<string | null>(null);
  const [loadingLocal, setLoadingLocal] = useState(layoutProp === undefined);

  const useExternal = layoutProp !== undefined;
  const layout = useExternal ? layoutProp : layoutLocal;
  const loading = useExternal ? !!layoutLoadingProp : loadingLocal;
  const loadError = useExternal ? layoutErrorProp ?? null : loadErrorLocal;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  const { zoom, setZoom, pan, setPan } = useDesignerCanvas(layout?.layout_id ?? null);

  useEffect(() => {
    if (useExternal) return;
    let cancelled = false;
    setLoadingLocal(true);
    setLoadErrorLocal(null);
    layoutService
      .getLayout({ tenant_id: tenantId, warehouse_id: warehouseId })
      .then((res) => {
        if (cancelled) return;
        const payload = res.data as { layout?: Record<string, unknown> } | undefined;
        const d = (payload?.layout ?? res.data ?? {}) as Record<string, unknown>;
        if (!d || typeof d !== "object") {
          setLoadErrorLocal("Brak danych layoutu magazynu.");
          setLayoutLocal(null);
          return;
        }
        setLayoutLocal(layoutStateFromWarehouseApiPayload(d, warehouseId));
      })
      .catch(() => {
        if (!cancelled) {
          setLoadErrorLocal("Nie udało się wczytać planu magazynu.");
          setLayoutLocal(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingLocal(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, warehouseId, useExternal]);

  const focusedUuid = (locationUuid ?? "").trim();
  const highlightedBinUUIDs = useMemo(() => {
    const s = new Set<string>();
    if (focusedUuid) s.add(focusedUuid);
    return s;
  }, [focusedUuid]);

  const highlightedRackIds = useMemo(() => {
    if (activeRackId == null) return undefined;
    return new Set<string>([String(activeRackId)]);
  }, [activeRackId]);

  const getCellFromEvent = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const svg = svgRef.current;
      if (!svg || !layout) return null;
      return getCellFromWarehouseLayoutSvg(svg, e.clientX, e.clientY, layout.grid_cols, layout.grid_rows);
    },
    [layout],
  );

  const noop = useCallback(() => {}, []);
  const noopBool = useCallback((_fn: (v: boolean) => boolean) => {}, []);
  const stampRackFromCatalogItem = useCallback((_cell: { x: number; y: number }, _item: CatalogItem) => {}, []);

  const onRackClick = useCallback(
    (rackId: number | string) => {
      const n = typeof rackId === "number" ? rackId : Number(rackId);
      if (Number.isFinite(n) && n > 0) onRackFocus?.(n);
    },
    [onRackFocus],
  );

  const width = layout ? layout.grid_cols * BASE_PX_PER_CELL : 0;
  const height = layout ? layout.grid_rows * BASE_PX_PER_CELL : 0;

  if (loading) {
    return (
      <div className={`flex h-full min-h-[240px] items-center justify-center bg-slate-50 text-sm text-slate-600 ${className}`}>
        Ładowanie planu magazynu…
      </div>
    );
  }

  if (loadError || !layout) {
    return (
      <div className={`flex h-full min-h-[240px] items-center justify-center bg-slate-50 px-4 text-center text-sm text-slate-600 ${className}`}>
        {loadError || "Brak planu magazynu."}
      </div>
    );
  }

  if (layout.racks.length === 0) {
    return (
      <div className={`flex h-full min-h-[240px] items-center justify-center bg-slate-50 text-sm text-slate-600 ${className}`}>
        Brak regałów w projekcie magazynu.
      </div>
    );
  }

  return (
    <div className={`relative h-full min-h-[240px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50 ${className}`}>
      <WarehouseLayoutRenderer
        mode="read"
        layout={layout}
        selectedWarehouseId={warehouseId}
        loading={false}
        zoom={zoom}
        setZoom={setZoom}
        pan={pan}
        setPan={setPan}
        placementMode={false}
        ghostPosition={null}
        ghostW={0}
        ghostH={0}
        ghostCollision={false}
        draggingFromCatalog={null}
        catalogGhostPosition={null}
        setCatalogGhostPosition={noop}
        stampRackFromCatalogItem={stampRackFromCatalogItem}
        getCellFromEvent={getCellFromEvent}
        snapPosition={snapPosition}
        rectsOverlap={rectsOverlap}
        cellPx={BASE_PX_PER_CELL}
        width={width}
        height={height}
        svgRef={svgRef}
        canvasContainerRef={canvasContainerRef}
        onMouseMove={noop}
        onMouseDown={noop}
        onMouseUp={noop}
        onMouseLeave={noop}
        panMode={false}
        isPanning={false}
        selectedRackIds={[]}
        collisionRackId={null}
        selectedRack={undefined}
        isMultiSelect={false}
        setInternalLayoutRackId={noop}
        setShowElevationForRackId={noop}
        setLayout={useExternal ? noop : setLayoutLocal}
        setSelectedRackId={noop}
        setSelectedRackIds={noop}
        marqueeStart={null}
        marqueeEnd={null}
        cursorCm={null}
        draggingRackId={null}
        rackDragPreviewPosition={null}
        dragSlotHighlights={null}
        defaultRowSlotW={DEFAULT_ROW_SLOT_W}
        defaultRowSlotH={DEFAULT_ROW_SLOT_H}
        selectedRowContainerId={null}
        aisleToolActive={false}
        setAisleToolActive={noopBool}
        rowToolActive={false}
        setRowToolActive={noopBool}
        setRowToolTemplate={noop}
        rowToolTemplate={null}
        rowDrawStart={null}
        rowDrawEnd={null}
        rowGapCm={1}
        setRowGapCm={noop}
        showGrid
        setShowGrid={noopBool}
        showLabels
        setShowLabels={noopBool}
        selectedAisleIndex={null}
        draggingVisualType={null}
        setDraggingVisualType={noop}
        visualGhostPosition={null}
        setVisualGhostPosition={noop}
        addVisualElement={noop}
        getDefaultVisualSize={getDefaultVisualSize}
        selectedVisualId={null}
        specialLocations={{ pick_start: null, packing: null, dock: null }}
        highlightedBinUUIDs={highlightedBinUUIDs}
        focusedBinUUID={focusedUuid || null}
        highlightedRackIds={highlightedRackIds}
        onRackClick={onRackClick}
        getRackDisplayId={getRackDisplayId}
        showRoute={false}
        pathPoints={null}
        pathSegments={null}
        pathMarkers={null}
        routeStops={null}
        isLiveView
      />
    </div>
  );
}

/** Resolve rack from layout matching backend rack id / name. */
export function findRackInLayout(layout: LayoutState | null, rackId?: number | null, rackName?: string | null): RackState | null {
  if (!layout?.racks.length) return null;
  if (rackId != null) {
    const byId = layout.racks.find((r) => r.id === rackId);
    if (byId) return byId;
  }
  const name = (rackName ?? "").trim();
  if (name) {
    const byName = layout.racks.find((r) => (r.name ?? "").trim() === name);
    if (byName) return byName;
  }
  return null;
}
