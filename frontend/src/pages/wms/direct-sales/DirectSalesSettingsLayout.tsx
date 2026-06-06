import { Outlet } from "react-router-dom";

import { useWarehouse } from "../../../context/WarehouseContext";
import { useDirectSalesResolvedSettings } from "../../../hooks/directSales/useDirectSalesResolvedSettings";
import { ResolvedDirectSalesSettingsProvider } from "../../../modules/directSales/settings/resolvedDirectSalesSettings";

/**
 * Route shell for /wms/direct-sales — loads settings (cache-first) and provides context
 * before any terminal/session hooks mount.
 */
export default function DirectSalesSettingsLayout() {
  const { warehouse } = useWarehouse();
  const settings = useDirectSalesResolvedSettings(warehouse?.id ?? null);

  return (
    <ResolvedDirectSalesSettingsProvider value={settings.resolvedDirectSalesSettings}>
      {settings.error && !settings.refreshing ? (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          Ustawienia z pamięci podręcznej — {settings.error}
          <button type="button" className="ml-2 underline" onClick={() => void settings.reload()}>
            Odśwież
          </button>
        </div>
      ) : null}
      <Outlet />
    </ResolvedDirectSalesSettingsProvider>
  );
}
