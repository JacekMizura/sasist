import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";
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
  ERP_SIDEBAR_NAV_SCROLL,
  ERP_SIDEBAR_SECTION_LABEL,
  WMS_NAV_ACCENT,
  getNavCategoryAccent,
} from "./erpSidebarStyles";

const CATEGORY_ICON = 20;
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

type SidebarNavButtonProps = {
  active: boolean;
  hovered: boolean;
  accentId: string;
  icon: LucideIcon;
  label: string;
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave: () => void;
};

function SidebarNavButton({
  active,
  hovered,
  accentId,
  icon: Icon,
  label,
  onMouseEnter,
  onMouseLeave,
}: SidebarNavButtonProps) {
  const accent = getNavCategoryAccent(accentId);

  return (
    <button
      type="button"
      className={[
        "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
        active
          ? `${accent.activeBgClass} ${accent.activeTextClass}`
          : `text-slate-500 ${accent.hoverBgClass} hover:text-slate-900`,
        !active && hovered ? "bg-slate-100" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {active ? (
        <span
          className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full ${accent.barClass}`}
          aria-hidden
        />
      ) : null}
      <Icon
        size={CATEGORY_ICON}
        strokeWidth={active ? 2 : 1.5}
        className={`shrink-0 transition-colors ${
          active ? accent.activeIconClass : "text-slate-400 group-hover:text-slate-600"
        }`}
      />
      <span className={`min-w-0 flex-1 truncate text-[14px] ${active ? "font-semibold" : "font-medium"}`}>
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
    <div className="flex h-screen min-h-0 overflow-hidden bg-slate-50">
      <aside
        className={`${SIDEBAR_W} z-20 flex shrink-0 flex-col border-r border-slate-200/80 bg-white shadow-[4px_0_24px_rgba(0,0,0,0.02)]`}
      >
        <div className="flex h-16 shrink-0 items-center px-3">
          <ErpCompactBrandLink />
        </div>

        <nav
          className={`min-h-0 flex-1 overflow-y-auto px-3 py-2 ${ERP_SIDEBAR_NAV_SCROLL}`}
          aria-label="Menu główne"
        >
          <div className={ERP_SIDEBAR_SECTION_LABEL}>Menu główne</div>

          <div className="flex flex-col gap-1">
            {NAV_FLYOUT_CATEGORIES.map((cat) => {
              const contained = categoryContainsCurrentRoute(cat, pathname);
              const isHovered = hoveredCategoryId === cat.id;

              return (
                <SidebarNavButton
                  key={cat.id}
                  active={contained}
                  hovered={isHovered}
                  accentId={cat.id}
                  icon={cat.Icon}
                  label={cat.label}
                  onMouseEnter={(e) => onTriggerEnter(cat.id, e.currentTarget)}
                  onMouseLeave={onTriggerLeave}
                />
              );
            })}
          </div>

          <div className="my-5 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" role="separator" />

          <div className={ERP_SIDEBAR_SECTION_LABEL}>Integracje</div>

          <Link
            to={WMS_SIDEBAR_DIRECT.path}
            className={[
              "group relative flex w-full items-center justify-between rounded-xl px-3 py-2.5 transition-all duration-200",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500",
              wmsActive
                ? `${WMS_NAV_ACCENT.activeBgClass} ${WMS_NAV_ACCENT.activeTextClass}`
                : `text-slate-600 ${WMS_NAV_ACCENT.hoverBgClass} hover:text-orange-800`,
            ].join(" ")}
          >
            {wmsActive ? (
              <span
                className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full ${WMS_NAV_ACCENT.barClass}`}
                aria-hidden
              />
            ) : null}
            <span className="flex min-w-0 items-center gap-3">
              <span
                className={`rounded-lg p-1.5 transition-colors ${
                  wmsActive
                    ? "bg-orange-100 text-orange-600"
                    : "bg-slate-50 text-slate-400 group-hover:bg-orange-100 group-hover:text-orange-600"
                }`}
              >
                <WmsIcon size={16} strokeWidth={2} />
              </span>
              <span className={`truncate text-[14px] ${wmsActive ? "font-semibold" : "font-medium"}`}>
                {WMS_SIDEBAR_DIRECT.label}
              </span>
            </span>
            <ChevronRight
              size={16}
              strokeWidth={2}
              className={`shrink-0 transition-transform ${
                wmsActive ? "translate-x-0.5 text-orange-400" : "text-slate-300 group-hover:text-orange-300"
              }`}
              aria-hidden
            />
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
        <header className="flex shrink-0 flex-col border-b border-slate-200/90 bg-white">
          <PanelGlobalStatusStrip />
        </header>
        <main
          className={`flex min-h-0 min-w-0 flex-1 flex-col bg-slate-50 ${designerFill ? "overflow-hidden" : wmsSettingsShellScroll ? "overflow-visible" : "overflow-y-auto"}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
