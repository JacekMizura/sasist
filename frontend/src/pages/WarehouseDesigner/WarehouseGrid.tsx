import { useCallback, useState, useEffect } from "react";
import api from "../../api/axios";
import { useWarehouseDesigner, type MapElement } from "../../context/WarehouseDesignerContext";

const CELL_PX = 32;

function elementColor(el: MapElement): string {
  switch (el.type) {
    case "rack":
      return "#3b82f6";
    case "zone":
      return "#eab308";
    case "aisle":
      return "#94a3b8";
    case "workstation":
      return "#22c55e";
    default:
      return "#64748b";
  }
}

export default function WarehouseGrid() {
  const {
    layout,
    selectedTool,
    rackConfig,
    pathPreviewMode,
    pathStart,
    pathEnd,
    pathPoints,
    setPathStart,
    setPathEnd,
    setPathPoints,
    refreshLayout,
  } = useWarehouseDesigner();

  const [placing, setPlacing] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<number | null>(null);

  const cols = layout?.grid_cols ?? 20;
  const rows = layout?.grid_rows ?? 15;
  const width = cols * CELL_PX;
  const height = rows * CELL_PX;

  const getCell = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const col = Math.floor(x / CELL_PX);
      const row = Math.floor(y / CELL_PX);
      if (col >= 0 && col < cols && row >= 0 && row < rows) return { x: col, y: row };
      return null;
    },
    [cols, rows]
  );

  const handleCellClick = useCallback(
    async (e: React.MouseEvent<SVGSVGElement>) => {
      const cell = getCell(e);
      if (!cell || !layout) return;

      if ((selectedTool as string | null) === "path") {
        if (!pathStart) {
          setPathStart(cell);
          return;
        }
        if (!pathEnd) {
          setPathEnd(cell);
          return;
        }
        return;
      }

      if (selectedTool && (selectedTool as string) !== "path") {
        setPlacing(true);
        try {
          await api.post(`/warehouse-maps/${layout.id}/elements/`, {
            type: selectedTool,
            x: cell.x,
            y: cell.y,
            width: selectedTool === "rack" ? 1 : selectedTool === "zone" ? 3 : 1,
            height: selectedTool === "rack" ? 1 : selectedTool === "zone" ? 2 : 1,
            props:
              selectedTool === "rack"
                ? {
                    levels: rackConfig.levels,
                    bins_per_level: rackConfig.bins_per_level,
                    depth_cm: rackConfig.depth_cm,
                    width_cm: rackConfig.width_cm,
                    height_cm: rackConfig.height_cm,
                    rack_type: rackConfig.rack_type,
                    aisle_letter: rackConfig.aisle_letter,
                  }
                : undefined,
          });
          await refreshLayout();
        } catch (err) {
          console.error("Place element:", err);
        } finally {
          setPlacing(false);
        }
      } else {
        setSelectedElementId(null);
      }
    },
    [
      layout,
      selectedTool,
      rackConfig,
      pathStart,
      pathEnd,
      getCell,
      setPathStart,
      setPathEnd,
      refreshLayout,
    ]
  );

  useEffect(() => {
    if (!layout || !pathStart || !pathEnd) {
      setPathPoints([]);
      return;
    }
    let cancelled = false;
    api
      .post("/warehouse-maps/path/", {
        map_id: layout.id,
        start_x: pathStart.x,
        start_y: pathStart.y,
        end_x: pathEnd.x,
        end_y: pathEnd.y,
      })
      .then((res) => {
        if (!cancelled && res.data?.path) setPathPoints(res.data.path);
      })
      .catch(() => {
        if (!cancelled) setPathPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [layout?.id, pathStart, pathEnd, setPathPoints]);

  if (!layout) return null;

  return (
    <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="border border-slate-200 bg-white shadow-inner"
        onClick={handleCellClick}
        style={{ cursor: selectedTool || pathPreviewMode ? "crosshair" : "default" }}
      >
        {/* Grid lines */}
        {Array.from({ length: cols + 1 }, (_, i) => (
          <line
            key={`v-${i}`}
            x1={i * CELL_PX}
            y1={0}
            x2={i * CELL_PX}
            y2={height}
            stroke="#e2e8f0"
            strokeWidth={0.5}
          />
        ))}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <line
            key={`h-${i}`}
            x1={0}
            y1={i * CELL_PX}
            x2={width}
            y2={i * CELL_PX}
            stroke="#e2e8f0"
            strokeWidth={0.5}
          />
        ))}

        {/* Elements */}
        {layout.elements?.map((el) => (
          <g
            key={el.id}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedElementId(selectedElementId === el.id ? null : el.id);
            }}
            style={{ cursor: "pointer" }}
          >
            <rect
              x={el.x * CELL_PX + 1}
              y={el.y * CELL_PX + 1}
              width={el.width * CELL_PX - 2}
              height={el.height * CELL_PX - 2}
              fill={elementColor(el)}
              stroke={selectedElementId === el.id ? "#0f172a" : "#64748b"}
              strokeWidth={selectedElementId === el.id ? 2 : 0.5}
              rx={2}
            />
          </g>
        ))}

        {/* Path preview */}
        {pathStart && (
          <circle
            cx={pathStart.x * CELL_PX + CELL_PX / 2}
            cy={pathStart.y * CELL_PX + CELL_PX / 2}
            r={CELL_PX / 4}
            fill="#22c55e"
            stroke="#166534"
            strokeWidth={2}
          />
        )}
        {pathEnd && (
          <circle
            cx={pathEnd.x * CELL_PX + CELL_PX / 2}
            cy={pathEnd.y * CELL_PX + CELL_PX / 2}
            r={CELL_PX / 4}
            fill="#ef4444"
            stroke="#b91c1c"
            strokeWidth={2}
          />
        )}
        {pathPoints.length > 1 && (
          <polyline
            points={pathPoints
              .map((p) => `${p.x * CELL_PX + CELL_PX / 2},${p.y * CELL_PX + CELL_PX / 2}`)
              .join(" ")}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {placing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl">
          <div className="bg-white px-4 py-2 rounded-lg shadow font-bold text-slate-700">
            Dodawanie…
          </div>
        </div>
      )}
    </div>
  );
}
