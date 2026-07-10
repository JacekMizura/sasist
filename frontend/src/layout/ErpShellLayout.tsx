import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { type LucideIcon } from "lucide-react";
import ErpCompactBrandLink from "../components/layout/ErpCompactBrandLink";
import PanelGlobalStatusStrip from "../components/layout/PanelGlobalStatusStrip";
import { NAV_FLYOUT_CATEGORIES, isCategoryActive, type NavCategoryConfig } from "./mainNavConfig";
import NavFlyoutPanel from "./NavFlyoutPanel";
import { useNavFlyout } from "./useNavFlyout";
import {
  ERP_SIDEBAR_ACTIVE_BAR,
  ERP_SIDEBAR_NAV_SCROLL,
  ERP_SIDEBAR_WIDTH_CLASS,
  getNavCategoryAccent,
  type NavCategoryAccent,
} from "./erpSidebarStyles";
import { appLayoutTokens } from "./appLayoutTokens";
import { erpDensityClasses } from "./erpDensityTokens";

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
    erpDensityClasses.sidebarItemBase,
    erpDensityClasses.sidebarItemFocus,
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
        size={erpDensityClasses.sidebarIconSize}
        strokeWidth={active ? 2.25 : 1.5}
        className={`${erpDensityClasses.sidebarIcon} ${
          active ? accent.activeIconClass : "text-slate-400 group-hover:text-slate-600"
        }`}
      />
      <span className={`${erpDensityClasses.sidebarLabel} ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
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

  return (
    <div className={`flex h-screen min-h-0 overflow-hidden ${appLayoutTokens.appBackground}`}>
      <aside
        className={`${ERP_SIDEBAR_WIDTH_CLASS} z-20 flex shrink-0 flex-col border-r ${appLayoutTokens.appBorder} ${appLayoutTokens.appBackground}`}
      >
        <div className={erpDensityClasses.sidebarBrand}>
          <ErpCompactBrandLink />
        </div>

        <nav className={`${erpDensityClasses.sidebarNav} ${ERP_SIDEBAR_NAV_SCROLL}`} aria-label="Menu główne">
          <div className={erpDensityClasses.sidebarSectionList}>
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
