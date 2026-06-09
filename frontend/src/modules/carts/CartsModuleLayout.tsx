import { Outlet } from "react-router-dom";

import { TabsNav } from "../../components/layout/TabsNav";
import { CARTS_TABS } from "./cartsTabs";

/**
 * Wózki module shell — one white workspace (same rhythm as Dokumenty / PageContainer).
 * Tabs sit flush under the card border; content uses dense ERP padding.
 */
export default function CartsModuleLayout() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="w-full min-w-0 flex-1 p-4 md:p-6">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="shrink-0 border-b border-slate-200 bg-white px-4 pt-3 sm:px-5">
            <TabsNav
              items={CARTS_TABS}
              exact
              className="w-full gap-6 overflow-x-auto [-webkit-overflow-scrolling:touch]"
              aria-label="Wózki — zakładki"
            />
          </div>
          <main className="min-h-0 flex-1 overflow-auto bg-white p-4 sm:p-5">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
