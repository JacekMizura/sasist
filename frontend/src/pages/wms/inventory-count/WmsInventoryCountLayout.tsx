import { Outlet } from "react-router-dom";

import WmsInventoryDocumentSidebar from "@/modules/inventoryCount/ui/wms/WmsInventoryDocumentSidebar";
import { WMS_INV } from "@/modules/inventoryCount/ui/wms/theme";

/** WMS inventory — split shell: document list (left) + execution (right). */
export default function WmsInventoryCountLayout() {
  return (
    <div className={`flex min-h-full w-full flex-col ${WMS_INV.pageBg} font-sans ${WMS_INV.text} lg:flex-row lg:overflow-hidden`}>
      <WmsInventoryDocumentSidebar />
      <main className={WMS_INV.splitMain}>
        <Outlet />
      </main>
    </div>
  );
}
