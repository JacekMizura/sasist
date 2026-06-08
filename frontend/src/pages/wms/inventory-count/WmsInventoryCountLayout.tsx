import { Outlet } from "react-router-dom";

import { WMS_OPERATIONAL_CONTAINER } from "../../../components/wms/execution/wmsLayoutTokens";

/** WMS inventory — blind-count scanner shell. */
export default function WmsInventoryCountLayout() {
  return (
    <div className="flex min-h-full flex-col bg-white text-[#1a2b3c]">
      <div className={`${WMS_OPERATIONAL_CONTAINER} flex-1 py-6`}>
        <Outlet />
      </div>
    </div>
  );
}
