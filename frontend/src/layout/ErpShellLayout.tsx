import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { AppTopBar } from "../components/layout/topbar";
import ErpSidebar from "./ErpSidebar";
import { ErpSidebarUiProvider } from "./ErpSidebarUiContext";
import { appLayoutTokens } from "./appLayoutTokens";

export type ErpShellHeaderMode = "panel" | "settings";

type ErpShellLayoutProps = {
  children: ReactNode;
  /** `panel` vs `settings` — wpływa na drobne zachowanie przewijania (WMS w ustawieniach). */
  headerMode: ErpShellHeaderMode;
};

function isWarehouseDesignerRoute(pathname: string): boolean {
  return pathname.startsWith("/designer") || pathname.startsWith("/warehouse-designer");
}

/**
 * Wspólny szkielet ERP: lewy sidebar + fly-out + top bar + treść.
 */
export default function ErpShellLayout({ children, headerMode }: ErpShellLayoutProps) {
  const { pathname } = useLocation();

  const designerFill = isWarehouseDesignerRoute(pathname);
  const wmsSettingsShellScroll =
    headerMode === "settings" && (pathname === "/settings/wms" || pathname.startsWith("/settings/wms/"));

  return (
    <ErpSidebarUiProvider>
      <div className={`flex h-screen min-h-0 overflow-hidden ${appLayoutTokens.appBackground}`}>
        <ErpSidebar />

        <div
          className={`relative z-0 flex min-h-0 min-w-0 flex-1 flex-col ${wmsSettingsShellScroll ? "overflow-y-auto" : ""}`}
        >
          <header className="flex shrink-0 flex-col bg-white">
            <AppTopBar />
          </header>
          <main
            className={`flex min-h-0 min-w-0 flex-1 flex-col ${appLayoutTokens.appBackground} ${designerFill ? "overflow-hidden" : wmsSettingsShellScroll ? "overflow-visible" : "overflow-y-auto"}`}
          >
            {children}
          </main>
        </div>
      </div>
    </ErpSidebarUiProvider>
  );
}
