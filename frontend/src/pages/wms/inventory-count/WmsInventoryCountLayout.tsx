import { Outlet, useMatch } from "react-router-dom";

import WmsInventoryDocumentSwitcher from "../../../modules/inventoryCount/components/WmsInventoryDocumentSwitcher";
import { WMS_OPERATIONAL_CONTAINER } from "../../../components/wms/execution/wmsLayoutTokens";

/** WMS inventory — document-scoped operational shell. */
export default function WmsInventoryCountLayout() {
  const onDocumentRoute = Boolean(useMatch("/wms/inventory-count/d/:documentId/*"));

  return (
    <div className="bg-white font-sans text-slate-900">
      <div className={`${WMS_OPERATIONAL_CONTAINER} pt-1 pb-3`}>
        {onDocumentRoute ? <WmsInventoryDocumentSwitcher /> : null}
        <Outlet />
      </div>
    </div>
  );
}
