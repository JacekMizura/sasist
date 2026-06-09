import { Outlet, useMatch } from "react-router-dom";

import WmsInventoryDocumentSwitcher from "@/modules/inventoryCount/ui/wms/WmsInventoryDocumentSwitcher";
import { wmsInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import { WMS_INV } from "@/modules/inventoryCount/ui/wms/theme";

/** WMS inventory — fullscreen operational shell (document queue or execution). */
export default function WmsInventoryCountLayout() {
  const onStartScreen = Boolean(useMatch({ path: wmsInventoryCountPaths.root, end: true }));

  return (
    <div className={`flex min-h-full w-full flex-col ${WMS_INV.pageBg} font-sans ${WMS_INV.text}`}>
      {!onStartScreen ? <WmsInventoryDocumentSwitcher /> : null}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
