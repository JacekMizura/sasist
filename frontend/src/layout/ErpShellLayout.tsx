import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Factory, Tablet } from "lucide-react";

import ErpCompactBrandLink from "../components/layout/ErpCompactBrandLink";
import PanelGlobalStatusStrip from "../components/layout/PanelGlobalStatusStrip";
import {
  NAV_FLYOUT_CATEGORIES,
  isCategoryActive,
  type NavCategoryConfig,
} from "./mainNavConfig";
import { isNavPathActive } from "./navActive";
import NavFlyoutPanel from "./NavFlyoutPanel";
import { useNavFlyout } from "./useNavFlyout";

const CATEGORY_ICON = 22;
const SIDEBAR_W = "w-60";

export type ErpShellHeaderMode = "panel" | "settings";

type ErpShellLayoutProps = {
  children: ReactNode;
  /** `panel` vs `settings` — wpływa na drobne zachowanie przewijania (WMS w ustawieniach); pasek KPI jest wspólny. */
  headerMode: ErpShellHeaderMode;
};

function isWarehouseDesignerRoute(pathname: string): boolean {
  return pathname.startsWith("/designer") || pathname.startsWith("/warehouse-designer");
}

function categoryContainsCurrentRoute(cat: NavCategoryConfig, pathname: string): boolean {
  return isCategoryActive(cat, pathname);
}

/**
 * Wspólny szkielet ERP: lewy sidebar + fly-out + nagłówek + treść.
 * Używany przez {@link MainPanelLayout} oraz {@link SettingsAdminLayout} — terminal WMS ma osobny layout.
 */
export default function ErpShellLayout({ children, headerMode }: ErpShellLayoutProps) {
  const { pathname } = useLocation();
  const {
    hoveredCategoryId,
    anchorTop,
    onTriggerEnter,
    onTriggerLeave,
    onPanelEnter,
    onPanelLeave,
  } = useNavFlyout();

  const openCategory = hoveredCategoryId
    ? NAV_FLYOUT_CATEGORIES.find((c) => c.id === hoveredCategoryId) ?? null
    : null;

  const designerFill = isWarehouseDesignerRoute(pathname);
  const wmsSettingsShellScroll =
    headerMode === "settings" && (pathname === "/settings/wms" || pathname.startsWith("/settings/wms/"));

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-slate-100">
      <aside className={`${SIDEBAR_W} flex shrink-0 flex-col border-r border-slate-200 bg-white shadow-sm`}>
        <div className="flex shrink-0 items-center border-b border-slate-100 px-2 py-2">
          <ErpCompactBrandLink />
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 text-sm" aria-label="Menu główne">
          {NAV_FLYOUT_CATEGORIES.map((cat) => {
            const Icon = cat.Icon;
            const contained = categoryContainsCurrentRoute(cat, pathname);
            const isHovered = hoveredCategoryId === cat.id;
            const base =
              "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";
            const defaultCls = [
              contained
                ? "bg-slate-100 text-slate-800 ring-1 ring-slate-200/90"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              !contained && isHovered ? "bg-slate-100" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={cat.id}
                type="button"
                className={`${base} ${defaultCls}`}
                onMouseEnter={(e) => onTriggerEnter(cat.id, e.currentTarget)}
                onMouseLeave={onTriggerLeave}
              >
                <span className="text-slate-500 [&_svg]:h-[22px] [&_svg]:w-[22px]">
                  <Icon size={CATEGORY_ICON} />
                </span>
                <span className="min-w-0 flex-1 truncate text-left">{cat.label}</span>
              </button>
            );
          })}
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
            <Link
              to="/wms/menu"
              className="flex w-full items-center gap-3 rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-3 text-sm font-bold text-amber-950 transition-colors hover:bg-amber-100"
            >
              <Tablet className="h-[22px] w-[22px] text-amber-700" aria-hidden />
              <span className="truncate">Terminal WMS</span>
            </Link>
            <Link
              to="/wms/production"
              className={[
                "flex w-full items-center gap-3 rounded-lg border-2 px-3 py-3 text-sm font-bold transition-colors",
                pathname === "/wms/production" || pathname.startsWith("/wms/production/")
                  ? "border-violet-500 bg-violet-600 text-white shadow-md"
                  : "border-violet-300 bg-violet-50 text-violet-950 hover:bg-violet-100",
              ].join(" ")}
            >
              <Factory className="h-[22px] w-[22px]" aria-hidden />
              <span className="truncate">Produkcja</span>
            </Link>
          </div>
        </nav>
      </aside>

      <NavFlyoutPanel
        category={openCategory}
        anchorTop={anchorTop}
        pathname={pathname}
        onMouseEnter={onPanelEnter}
        onMouseLeave={onPanelLeave}
      />

      <div
        className={`relative z-0 flex min-h-0 min-w-0 flex-1 flex-col ${wmsSettingsShellScroll ? "overflow-y-auto" : ""}`}
      >
        <header className="flex shrink-0 flex-col border-b border-slate-200/90 bg-white">
          <PanelGlobalStatusStrip />
        </header>
        <main
          className={`flex min-h-0 min-w-0 flex-1 flex-col bg-slate-100 ${designerFill ? "overflow-hidden" : wmsSettingsShellScroll ? "overflow-visible" : "overflow-y-auto"}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
