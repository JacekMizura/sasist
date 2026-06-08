import { Outlet } from "react-router-dom";
import { ScanLine } from "lucide-react";

import { WMS_OPERATIONAL_CONTAINER } from "../../../components/wms/execution/wmsLayoutTokens";
import { WMS_INV } from "../../../modules/inventoryCount/wmsIndustrialTheme";

/** WMS inventory — single scan-first terminal (no ERP filters here). */
export default function WmsInventoryCountLayout() {
  return (
    <div className={`flex min-h-full flex-col ${WMS_INV.bg} ${WMS_INV.text}`}>
      <div className={`${WMS_OPERATIONAL_CONTAINER} shrink-0 border-b ${WMS_INV.border} ${WMS_INV.surface} py-2 shadow-sm`}>
        <p className={`flex items-center gap-2 text-xs font-semibold ${WMS_INV.textMuted}`}>
          <ScanLine className="h-3.5 w-3.5 shrink-0 text-[#1e4d8c]" aria-hidden />
          Inwentaryzacja — terminal operacyjny (skan → zapis → następny)
        </p>
      </div>
      <div className={`${WMS_OPERATIONAL_CONTAINER} flex-1 py-4`}>
        <Outlet />
      </div>
    </div>
  );
}
