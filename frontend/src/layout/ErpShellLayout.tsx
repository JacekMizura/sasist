import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { type LucideIcon } from "lucide-react";
import ErpCompactBrandLink from "../components/layout/ErpCompactBrandLink";
import PanelGlobalStatusStrip from "../components/layout/PanelGlobalStatusStrip";
import {
  NAV_FLYOUT_CATEGORIES,
  WMS_SIDEBAR_DIRECT,
  isCategoryActive,
  type NavCategoryConfig,
} from "./mainNavConfig";
import { isNavPathActive } from "./navActive";
import NavFlyoutPanel from "./NavFlyoutPanel";
import { useNavFlyout } from "./useNavFlyout";
import {
  ERP_SIDEBAR_ACTIVE_BAR,
  ERP_SIDEBAR_NAV_SCROLL,
  ERP_SIDEBAR_WIDTH_CLASS,
  WMS_NAV_ACCENT,
  getNavCategoryAccent,
  type NavCategoryAccent,
} from "./erpSidebarStyles";
import { appLayoutTokens } from "./appLayoutTokens";

const CATEGORY_ICON = 20;

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

function sidebarItemClass(active: boolean, accent: NavCategoryAccent, hovered: boolean): string {
  return [
    "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
    active
      ? `${accent.activeBgClass} ${accent.activeTextClass}`
      : `text-slate-500 ${accent.hoverBgClass} hover:text-slate-900`,
    !active && hovered ? "bg-slate-100" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

type SidebarNavButtonProps = {
  active: boolean;
  hovered: boolean;
  accent: NavCategoryAccent;
  icon: LucideIcon;
  label: string;
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave: () => void;
};

function SidebarNavButton({
  active,
  hovered,
  accent,
  icon: Icon,
  label,
  onMouseEnter,
  onMouseLeave,
}: SidebarNavButtonProps) {
  return (
    <button
      type="button"
      className={sidebarItemClass(active, accent, hovered)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {active ? <span className={`${ERP_SIDEBAR_ACTIVE_BAR} ${accent.barClass}`} aria-hidden /> : null}
      <Icon
        size={CATEGORY_ICON}
        strokeWidth={active ? 2.25 : 1.5}
        className={`shrink-0 transition-colors ${
          active ? accent.activeIconClass : "text-slate-400 group-hover:text-slate-600"
        }`}
      />
      <span className={`min-w-0 flex-1 truncate text-[13px] leading-tight ${active ? "font-semibold" : "font-medium"}`}>
        {label}
      </span>
    </button>
  );
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

  const wmsActive = isNavPathActive(pathname, "/wms");
  const WmsIcon = WMS_SIDEBAR_DIRECT.Icon;

  return (
    <div className={`flex h-screen min-h-0 overflow-hidden ${appLayoutTokens.appBackground}`}>
      <aside
        className={`${ERP_SIDEBAR_WIDTH_CLASS} z-20 flex shrink-0 flex-col border-r ${appLayoutTokens.appBorder} ${appLayoutTokens.appBackground}`}
      >
        <div className="flex h-[52px] shrink-0 items-center px-2.5">
          <ErpCompactBrandLink />
        </div>

        <nav
          className={`min-h-0 flex-1 overflow-y-auto px-2.5 py-1.5 ${ERP_SIDEBAR_NAV_SCROLL}`}
          aria-label="Menu główne"
        >
          <div className="flex flex-col gap-0.5">
            {NAV_FLYOUT_CATEGORIES.map((cat) => {
              const contained = categoryContainsCurrentRoute(cat, pathname);
              const isHovered = hoveredCategoryId === cat.id;

              return (
                <SidebarNavButton
                  key={cat.id}
                  active={contained}
                  hovered={isHovered}
                  accent={getNavCategoryAccent(cat.id)}
                  icon={cat.Icon}
                  label={cat.label}
                  onMouseEnter={(e) => onTriggerEnter(cat.id, e.currentTarget)}
                  onMouseLeave={onTriggerLeave}
                />
              );
            })}
          </div>

          <div className="my-2 border-t border-slate-200/90" role="separator" />

          <Link
            to={WMS_SIDEBAR_DIRECT.path}
            className={[
              sidebarItemClass(wmsActive, WMS_NAV_ACCENT, false),
              "focus-visible:outline-orange-500",
            ].join(" ")}
          >
            {wmsActive ? (
              <span className={`${ERP_SIDEBAR_ACTIVE_BAR} ${WMS_NAV_ACCENT.barClass}`} aria-hidden />
            ) : null}
            <WmsIcon
              size={CATEGORY_ICON}
              strokeWidth={wmsActive ? 2.25 : 1.5}
              className={`shrink-0 transition-colors ${
                wmsActive ? WMS_NAV_ACCENT.activeIconClass : "text-slate-400 group-hover:text-orange-600"
              }`}
            />
            <span
              className={`min-w-0 flex-1 truncate text-[13px] leading-tight ${wmsActive ? "font-semibold" : "font-medium"}`}
            >
              {WMS_SIDEBAR_DIRECT.label}
            </span>
          </Link>
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
        <header className={`flex shrink-0 flex-col border-b ${appLayoutTokens.appBorder} ${appLayoutTokens.appBackground}`}>
          <PanelGlobalStatusStrip />
        </header>
        <main
          className={`flex min-h-0 min-w-0 flex-1 flex-col ${appLayoutTokens.appBackground} ${designerFill ? "overflow-hidden" : wmsSettingsShellScroll ? "overflow-visible" : "overflow-y-auto"}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
