import { Outlet, useMatch } from "react-router-dom";

import WmsInventoryDocumentSwitcher from "../../../modules/inventoryCount/components/WmsInventoryDocumentSwitcher";
import { WMS_INV } from "../../../modules/inventoryCount/ui/wms/theme";

/** WMS inventory — document-scoped operational shell. */
export default function WmsInventoryCountLayout() {
  const onDocumentRoute = Boolean(useMatch("/wms/inventory-count/d/:documentId/*"));

  return (
    <div className={`min-h-full ${WMS_INV.pageBg} font-sans ${WMS_INV.text}`}>
      {onDocumentRoute ? <WmsInventoryDocumentSwitcher /> : null}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
