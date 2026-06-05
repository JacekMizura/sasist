import { Link } from "react-router-dom";
import { Maximize2, Menu, Minimize2 } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useWarehouseExecution } from "../../../context/WarehouseExecutionContext";
import { useWmsPinnedModes } from "../../../hooks/useWmsPinnedModes";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import WmsTopBarModuleNav from "../WmsTopBarModuleNav";

/** Zwarty pasek trybów WMS na trasach wykonawczych — wspólny dla całego terminala. */
export function WmsExecutionModeStrip() {
  const { user } = useAuth();
  const { warehouseMode, toggleWarehouseMode } = useWarehouseExecution();
  const { visibleNavTabs } = useWmsPinnedModes(user?.id ?? null);

  return (
    <header
      className="shrink-0 border-b border-slate-800 bg-slate-950 text-white"
      data-wms-execution-mode-strip
    >
      <div className="flex h-11 min-h-[2.75rem] items-center gap-1 px-2 sm:px-4">
        <Link
          to={WMS_ROUTES.menu}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/15"
          title="Menu WMS"
          aria-label="Menu WMS"
        >
          <Menu size={16} strokeWidth={2.5} />
        </Link>
        <nav className="flex h-full min-w-0 flex-1 items-center overflow-x-auto no-scrollbar">
          <WmsTopBarModuleNav
            tabs={visibleNavTabs}
            className="[&_a]:text-slate-400 [&_a:hover]:text-white [&_.text-orange-600]:text-orange-400"
          />
        </nav>
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/15"
          title={warehouseMode ? "Wyłącz tryb terminala" : "Tryb terminala magazynu"}
          onClick={toggleWarehouseMode}
        >
          {warehouseMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
    </header>
  );
}
