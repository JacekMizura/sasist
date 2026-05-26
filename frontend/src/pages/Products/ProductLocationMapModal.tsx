/**
 * Lazy-loaded: product location on warehouse map (read-only `WarehouseLayoutRenderer`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogItem, LayoutState, VisualElementType } from "../../types/warehouse";
import { WarehouseLayoutRenderer } from "../../components/warehouse/WarehouseLayoutRenderer";
import { layoutService } from "../../services/layoutService";
import { getRackDisplayId } from "../../components/warehouse/warehouseUtils";
import {
  BASE_PX_PER_CELL,
  DEFAULT_ROW_SLOT_H,
  DEFAULT_ROW_SLOT_W,
  rectsOverlap,
  snapPosition,
} from "../WarehouseDesigner/DesignerRackPlacement";
import { useDesignerCanvas } from "../WarehouseDesigner/useDesignerCanvas";
import { getCellFromWarehouseLayoutSvg } from "../WarehouseDesigner/utils/designerMouseUtils";
import { layoutStateFromWarehouseApiPayload } from "./layoutStateFromWarehouseApi";

const TENANT_ID = 1;

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

export type ProductLocationMapModalProps = {
  open: boolean;
  onClose: () => void;
  tenantId?: number;
  warehouseId: number;
  productId: number;
  productName: string;
  /** UUID of the location row that opened the map (stronger highlight). */
  focusedLocationUuid: string;
  /** All inventory location UUIDs for this product in this warehouse (optional extras highlighted softly). */
  relatedLocationUuids: string[];
};

export default function ProductLocationMapModal({
  open,
  onClose,
  tenantId = TENANT_ID,
  warehouseId,
  productId,
  productName,
  focusedLocationUuid,
  relatedLocationUuids,
}: ProductLocationMapModalProps) {
  const [layout, setLayout] = useState<LayoutState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  const { zoom, setZoom, pan, setPan } = useDesignerCanvas(layout?.layout_id ?? null);

  useEffect(() => {
    if (!open) {
      setLayout(null);
      setLoadError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setLayout(null);
    layoutService
      .getLayout({ tenant_id: tenantId, warehouse_id: warehouseId })
      .then((res) => {
        if (cancelled) return;
        const payload = res.data as { layout?: Record<string, unknown> } | undefined;
        const d = (payload?.layout ?? res.data ?? {}) as Record<string, unknown>;
        if (!d || typeof d !== "object") {
          setLoadError("Brak danych layoutu.");
          return;
        }
        setLayout(layoutStateFromWarehouseApiPayload(d, warehouseId));
      })
      .catch(() => {
        if (!cancelled) setLoadError("Nie udało się wczytać planu magazynu.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, warehouseId]);

  const highlightedBinUUIDs = useMemo(() => {
    const s = new Set<string>();
    const focus = focusedLocationUuid.trim();
    if (focus) s.add(focus);
    for (const u of relatedLocationUuids) {
      const t = (u ?? "").trim();
      if (t) s.add(t);
    }
    return s;
  }, [focusedLocationUuid, relatedLocationUuids]);

  const focusedNorm = focusedLocationUuid.trim();

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

  const width = layout ? layout.grid_cols * BASE_PX_PER_CELL : 0;
  const height = layout ? layout.grid_rows * BASE_PX_PER_CELL : 0;

  const stampRackFromCatalogItem = useCallback((_cell: { x: number; y: number }, _item: CatalogItem) => {}, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[min(92vh,900px)] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Lokalizacja na mapie magazynu"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">Lokalizacja na mapie</h2>
            <p className="mt-1 truncate text-sm text-slate-600">
              {productName} <span className="text-slate-400">·</span> ID {productId}{" "}
              <span className="text-slate-400">·</span> magazyn {warehouseId}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Ctrl + kółko myszy: zoom. Pozostałe lokalizacje produktu są oznaczone na niebiesko; wybrana — na pomarańczowo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Zamknij
          </button>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-50">
          {loading && <p className="p-6 text-sm text-slate-600">Ładowanie mapy…</p>}
          {!loading && loadError && <p className="p-6 text-sm text-red-700">{loadError}</p>}
          {!loading && !loadError && layout && layout.racks.length === 0 && (
            <p className="p-6 text-sm text-slate-600">Brak regałów w layoutcie tego magazynu.</p>
          )}
          {!loading && !loadError && layout && layout.racks.length > 0 && (
            <div className="h-[min(72vh,640px)] min-h-[280px] w-full overflow-hidden">
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
                setLayout={setLayout}
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
                focusedBinUUID={focusedNorm || null}
                getRackDisplayId={getRackDisplayId}
                showRoute={false}
                pathPoints={null}
                pathSegments={null}
                pathMarkers={null}
                routeStops={null}
                isLiveView
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
