import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { useWarehouse } from "@/context/WarehouseContext";
import { useIsHandheldDevice } from "@/hooks/useIsHandheldDevice";
import { useWmsPinnedModes } from "@/hooks/useWmsPinnedModes";
import { WmsCollectorHome } from "./WmsCollectorHome";
import { WmsDesktopHome } from "./WmsDesktopHome";
import { useWmsLauncherBadges } from "./useWmsLauncherBadges";

/**
 * WMS start screen — desktop sectioned tiles vs collector list.
 * Shared: visibility, badges/KPI, navigation. Layout forks only on device.
 */
export default function WmsHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { warehouse } = useWarehouse();
  const isHandheld = useIsHandheldDevice();
  const {
    dashboardTiles,
    pinnedTabsInOrder,
    pinnableModules,
    isPinned,
    togglePin,
    movePinned,
  } = useWmsPinnedModes(user?.id ?? null);
  const { metrics, kpi, kpiMeta } = useWmsLauncherBadges(warehouse?.id ?? null);

  const onOpenModule = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  if (isHandheld) {
    return (
      <WmsCollectorHome tiles={dashboardTiles} metrics={metrics} onOpenModule={onOpenModule} />
    );
  }

  return (
    <WmsDesktopHome
      tiles={dashboardTiles}
      metrics={metrics}
      kpi={kpi}
      kpiMeta={kpiMeta}
      onOpenModule={onOpenModule}
      pinnableModules={pinnableModules}
      isPinned={isPinned}
      onTogglePin={togglePin}
      onMovePinned={movePinned}
      pinnedCount={pinnedTabsInOrder.length}
    />
  );
}
