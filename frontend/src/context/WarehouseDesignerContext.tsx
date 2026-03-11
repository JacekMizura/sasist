import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type ElementType = "rack" | "zone" | "aisle" | "workstation" | "pick_start" | "packing";

export type RackProps = {
  levels: number;
  bins_per_level: number;
  depth_cm: number;
  width_cm: number;
  height_cm: number;
  rack_type: "picking" | "pallet" | "consolidation";
  aisle_letter: string;
};

export type MapElement = {
  id: number;
  map_id: number;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  props?: Record<string, unknown>;
  bins?: Array<{
    id: number;
    address: string;
    max_volume_dm3: number;
    current_volume_dm3: number;
  }>;
};

export type WarehouseLayout = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  name: string;
  grid_cols: number;
  grid_rows: number;
  elements: MapElement[];
};

type WarehouseDesignerContextType = {
  layout: WarehouseLayout | null;
  setLayout: (l: WarehouseLayout | null) => void;
  selectedTool: ElementType | null;
  setSelectedTool: (t: ElementType | null) => void;
  rackConfig: RackProps;
  setRackConfig: (c: Partial<RackProps>) => void;
  pathPreviewMode: boolean;
  setPathPreviewMode: (v: boolean) => void;
  pathStart: { x: number; y: number } | null;
  pathEnd: { x: number; y: number } | null;
  pathPoints: Array<{ x: number; y: number }>;
  setPathStart: (p: { x: number; y: number } | null) => void;
  setPathEnd: (p: { x: number; y: number } | null) => void;
  setPathPoints: (p: Array<{ x: number; y: number }>) => void;
  clearPath: () => void;
  refreshLayout: () => Promise<void>;
};

const defaultRackConfig: RackProps = {
  levels: 4,
  bins_per_level: 6,
  depth_cm: 40,
  width_cm: 30,
  height_cm: 25,
  rack_type: "picking",
  aisle_letter: "A",
};

const WarehouseDesignerContext = createContext<WarehouseDesignerContextType | undefined>(undefined);

export function WarehouseDesignerProvider({
  children,
  mapId: _mapId,
  onRefresh,
}: {
  children: ReactNode;
  mapId: number | null;
  onRefresh: () => Promise<WarehouseLayout | null>;
}) {
  const [layout, setLayout] = useState<WarehouseLayout | null>(null);
  const [selectedTool, setSelectedTool] = useState<ElementType | null>(null);
  const [rackConfig, setRackConfigState] = useState<RackProps>(defaultRackConfig);
  const [pathPreviewMode, setPathPreviewMode] = useState(false);
  const [pathStart, setPathStart] = useState<{ x: number; y: number } | null>(null);
  const [pathEnd, setPathEnd] = useState<{ x: number; y: number } | null>(null);
  const [pathPoints, setPathPoints] = useState<Array<{ x: number; y: number }>>([]);

  const setRackConfig = useCallback((patch: Partial<RackProps>) => {
    setRackConfigState((prev) => ({ ...prev, ...patch }));
  }, []);

  const refreshLayout = useCallback(async () => {
    const next = await onRefresh();
    setLayout(next);
    return;
  }, [onRefresh]);

  const clearPath = useCallback(() => {
    setPathStart(null);
    setPathEnd(null);
    setPathPoints([]);
  }, []);

  return (
    <WarehouseDesignerContext.Provider
      value={{
        layout,
        setLayout,
        selectedTool,
        setSelectedTool,
        rackConfig,
        setRackConfig,
        pathPreviewMode,
        setPathPreviewMode,
        pathStart,
        pathEnd,
        pathPoints,
        setPathStart,
        setPathEnd,
        setPathPoints,
        clearPath,
        refreshLayout,
      }}
    >
      {children}
    </WarehouseDesignerContext.Provider>
  );
}

export function useWarehouseDesigner() {
  const ctx = useContext(WarehouseDesignerContext);
  if (!ctx) throw new Error("useWarehouseDesigner must be used inside WarehouseDesignerProvider");
  return ctx;
}
