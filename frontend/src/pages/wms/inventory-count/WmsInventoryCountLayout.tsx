import { Outlet } from "react-router-dom";

import { WMS_OPERATIONAL_CONTAINER } from "../../../components/wms/execution/wmsLayoutTokens";

/** WMS inventory — top-anchored operational shell. */
export default function WmsInventoryCountLayout() {
  return (
    <div className="bg-white font-sans text-slate-900">
      <div className={`${WMS_OPERATIONAL_CONTAINER} pt-1 pb-3`}>
        <Outlet />
      </div>
    </div>
  );
}
