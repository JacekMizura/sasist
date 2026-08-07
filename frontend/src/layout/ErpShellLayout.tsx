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

/** Product create/edit — full white surface (no slate-50 fragment under tabs). */
function isProductEditRoute(pathname: string): boolean {
  if (pathname === "/products/new") return true;
  return /^\/products\/[^/]+\/edit\/?$/.test(pathname);
}

/**
 * Wspólny szkielet ERP: pełna szerokość headera, poniżej sidebar + treść.
 *
 * Sidebar (`z-30`) and content (`relative z-0`) are sibling stacking contexts —
 * page `fixed` overlays inside content cannot cover the sidebar. Use
 * `AppOverlayPortal` (document.body) for Drawer / Sheet / Modal sheets.
 */
export default function ErpShellLayout({ children, headerMode }: ErpShellLayoutProps) {
  const { pathname } = useLocation();

  const designerFill = isWarehouseDesignerRoute(pathname);
  const productEditWhite = isProductEditRoute(pathname);
  const wmsSettingsShellScroll =
    headerMode === "settings" && (pathname === "/settings/wms" || pathname.startsWith("/settings/wms/"));

  const mainSurface = productEditWhite ? "bg-white" : appLayoutTokens.appBackground;

  return (
    <ErpSidebarUiProvider>
      <div className={`flex h-screen min-h-0 flex-col overflow-hidden ${appLayoutTokens.appBackground}`}>
        <header className="z-40 flex w-full shrink-0 flex-col bg-white">
          <AppTopBar />
        </header>

        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <ErpSidebar />

          <div
            className={`relative z-0 flex min-h-0 min-w-0 flex-1 flex-col ${
              wmsSettingsShellScroll ? "overflow-y-auto [scrollbar-gutter:stable]" : ""
            } ${productEditWhite ? "bg-white" : ""}`}
          >
            <main
              className={`flex min-h-0 min-w-0 flex-1 flex-col ${mainSurface} ${
                designerFill
                  ? "overflow-hidden"
                  : wmsSettingsShellScroll
                    ? "overflow-visible"
                    : "overflow-y-auto [scrollbar-gutter:stable]"
              }`}
            >
              {children}
            </main>
          </div>
        </div>
      </div>
    </ErpSidebarUiProvider>
  );
}
