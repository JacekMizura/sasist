import { useWarehouseDesigner, type ElementType } from "../../context/WarehouseDesignerContext";

const tools: { id: ElementType | "path"; label: string }[] = [
  { id: "rack", label: "Regał" },
  { id: "zone", label: "Strefa (gabaryty)" },
  { id: "aisle", label: "Przejście" },
  { id: "workstation", label: "Stanowisko" },
  { id: "path", label: "Ścieżka (2 punkty)" },
];

export default function Toolbar() {
  const {
    selectedTool,
    setSelectedTool,
    pathPreviewMode,
    setPathPreviewMode,
    pathStart,
    pathEnd,
    clearPath,
  } = useWarehouseDesigner();

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
      <div className="text-xs font-black uppercase text-slate-500 mb-2">Narzędzia</div>
      <div className="flex flex-col gap-1">
        {tools.map((t) => {
          const isPath = t.id === "path";
          const active = isPath ? pathPreviewMode : selectedTool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (isPath) {
                  clearPath();
                  setPathPreviewMode(!pathPreviewMode);
                  setSelectedTool(null);
                } else {
                  setPathPreviewMode(false);
                  setSelectedTool(selectedTool === t.id ? null : (t.id as ElementType));
                }
              }}
              className={`px-3 py-2 rounded-lg text-left text-sm font-semibold transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {(pathStart || pathEnd) && (
        <button
          type="button"
          onClick={clearPath}
          className="mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200"
        >
          Wyczyść ścieżkę
        </button>
      )}
    </div>
  );
}
