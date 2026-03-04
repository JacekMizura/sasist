import { useEffect, useState, useCallback } from "react";
import api from "../../api/axios";
import { WarehouseDesignerProvider, useWarehouseDesigner, type WarehouseLayout } from "../../context/WarehouseDesignerContext";
import WarehouseGrid from "./WarehouseGrid";
import Toolbar from "./Toolbar";
import RackConfiguratorPanel from "./RackConfiguratorPanel";

const TENANT_ID = 1;
const WAREHOUSE_ID = 1;

function WarehouseDesignerContent() {
  const {
    layout,
    selectedTool,
    rackConfig: _rackConfig,
    refreshLayout,
  } = useWarehouseDesigner();

  useEffect(() => {
    refreshLayout();
  }, [refreshLayout]);

  if (!layout) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-500 font-bold uppercase">
        Ładowanie projektu…
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      <div className="flex flex-col gap-2 w-56 shrink-0">
        <Toolbar />
        {selectedTool === "rack" && <RackConfiguratorPanel />}
      </div>
      <div className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
        <WarehouseGrid />
      </div>
    </div>
  );
}

export default function WarehouseDesigner() {
  const [mapId, setMapId] = useState<number | null>(null);

  const loadMap = useCallback(async (): Promise<WarehouseLayout | null> => {
    try {
      const res = await api.get("/warehouse-maps/", {
        params: { tenant_id: TENANT_ID, warehouse_id: WAREHOUSE_ID },
      });
      const data = res.data;
      setMapId(data.id);
      return data as WarehouseLayout;
    } catch (e) {
      console.error("Load warehouse map:", e);
      return null;
    }
  }, []);

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="max-w-[1800px] mx-auto">
        <h1 className="text-2xl font-black uppercase tracking-widest text-slate-800 mb-6">
          Projektant Magazynu
        </h1>
        <WarehouseDesignerProvider mapId={mapId} onRefresh={loadMap}>
          <WarehouseDesignerContent />
        </WarehouseDesignerProvider>
      </div>
    </div>
  );
}
