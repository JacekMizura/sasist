import { useSearchParams } from "react-router-dom";
import { UI_STRINGS } from "../../constants/uiStrings";

export interface DesignerToolbarProps {
  mainView: "magazyn" | "layout";
  setMainView: (v: "magazyn" | "layout") => void;
  setEditingProductId: (v: React.SetStateAction<string | null>) => void;
  warehouses: { id: number; name: string }[];
  selectedWarehouseId: number | null;
  setSelectedWarehouseId: (v: number | null) => void;
  warehouseName: string;
  lastSavedAt: number | null;
}

export function DesignerToolbar({
  mainView,
  setMainView,
  setEditingProductId,
  warehouses,
  selectedWarehouseId,
  setSelectedWarehouseId,
  warehouseName,
  lastSavedAt,
}: DesignerToolbarProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  return (
    <>
      <nav className="flex rounded-xl bg-slate-100 p-0.5 border border-slate-100 shadow-sm" aria-label="Tryby">
        <button
          type="button"
          onClick={() => { setMainView("magazyn"); setEditingProductId(null); const next = new URLSearchParams(searchParams); next.delete("view"); setSearchParams(next); }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${mainView === "magazyn" ? "bg-cyan-600 text-white" : "text-slate-600 hover:bg-slate-200"}`}
        >
          {UI_STRINGS.warehouse.designerSubTabs.magazyn}
        </button>
        <button
          type="button"
          onClick={() => { setMainView("layout"); const next = new URLSearchParams(searchParams); next.set("view", "layout"); setSearchParams(next); }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${mainView === "layout" ? "bg-cyan-600 text-white" : "text-slate-600 hover:bg-slate-200"}`}
        >
          {UI_STRINGS.warehouse.designerSubTabs.layoutDesigner}
        </button>
      </nav>
      <div className="flex items-center gap-3">
        <select
          value={selectedWarehouseId ?? ""}
          onChange={(e) => setSelectedWarehouseId(e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2 min-w-[200px] focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
        >
          <option value="">{UI_STRINGS.warehouse.selector.selectWarehouse}</option>
          {warehouses.map((wh) => (
            <option key={wh.id} value={wh.id}>{wh.name}</option>
          ))}
        </select>
        {warehouseName ? (
          <span className="text-sm text-slate-600">{warehouseName}</span>
        ) : null}
        <span className={`text-xs font-mono px-2 py-1 rounded ${lastSavedAt != null ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`} title={lastSavedAt != null ? UI_STRINGS.warehouse.selector.savedToDb : UI_STRINGS.warehouse.selector.unsavedChanges}>
          {lastSavedAt != null ? UI_STRINGS.warehouse.selector.syncSaved : UI_STRINGS.warehouse.selector.notSaved}
        </span>
      </div>
    </>
  );
}
