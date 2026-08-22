import { useEffect } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  buildNavFlyoutCategories,
  NAV_SIDEBAR_SECTIONS,
  WMS_SIDEBAR_DIRECT,
  isCategoryActive,
  type NavCategoryConfig,
  type NavSidebarSectionConfig,
} from "./mainNavConfig";
import { categoryHasVisibleFlyoutItems, userCanSeePocztaNav } from "./navFlyoutAccess";
import { useAuth } from "../context/AuthContext";
import {
  ERP_SIDEBAR_ACTIVE_BAR,
  ERP_SIDEBAR_COLLAPSED_WIDTH_CLASS,
  ERP_SIDEBAR_COLLAPSED_WIDTH_PX,
  ERP_SIDEBAR_ICON_CLASS,
  ERP_SIDEBAR_ICON_COLLAPSED_CLASS,
  ERP_SIDEBAR_ICON_RAIL_LABEL_CLASS,
  ERP_SIDEBAR_NAV_SCROLL,
  ERP_SIDEBAR_SECTION_LABEL,
  ERP_SIDEBAR_SURFACE,
  ERP_SIDEBAR_WMS_EXPANDED_CLASS,
  ERP_SIDEBAR_WMS_ICON_CLASS,
  erpSidebarWmsCollapsedClassName,
  ERP_SIDEBAR_WIDTH_CLASS,
  ERP_SIDEBAR_WIDTH_PX,
  erpSidebarIconRailItemClassName,
  erpSidebarNavChevronClassName,
  erpSidebarNavIconClassName,
  erpSidebarNavItemClassName,
} from "./erpSidebarStyles";
import { useErpSidebarUi } from "./ErpSidebarUiContext";
import { useNavFlyout } from "./useNavFlyout";
import NavFlyoutPanel from "./NavFlyoutPanel";
import { useLabels } from "../labels";
import { getLabel } from "../labels/labelStore";

function categoryById(id: string, categories: NavCategoryConfig[]): NavCategoryConfig | undefined {
  return categories.find((c) => c.id === id);
}

type SidebarNavButtonProps = {
  active: boolean;
  collapsed: boolean;
  icon: LucideIcon;
  label: string;
  showChevron?: boolean;
  flyoutOpen?: boolean;
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave: () => void;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
};

function SidebarNavButton({
  active,
  collapsed,
  icon: Icon,
  label,
  showChevron,
  flyoutOpen,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: SidebarNavButtonProps) {
  const highlighted = active || Boolean(flyoutOpen);
  if (collapsed) {
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        aria-expanded={showChevron ? flyoutOpen : undefined}
        data-erp-nav-trigger
        className={erpSidebarIconRailItemClassName(highlighted)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
      >
        <Icon
          className={[ERP_SIDEBAR_ICON_COLLAPSED_CLASS, erpSidebarNavIconClassName(highlighted)].join(" ")}
          strokeWidth={highlighted ? 2.25 : 1.75}
          aria-hidden
        />
        <span className={ERP_SIDEBAR_ICON_RAIL_LABEL_CLASS}>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      aria-expanded={showChevron ? flyoutOpen : undefined}
      data-erp-nav-trigger
      className={erpSidebarNavItemClassName(highlighted)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {highlighted ? <span className={ERP_SIDEBAR_ACTIVE_BAR} aria-hidden /> : null}
      <Icon
        className={[ERP_SIDEBAR_ICON_CLASS, erpSidebarNavIconClassName(highlighted)].join(" ")}
        strokeWidth={highlighted ? 2.25 : 1.75}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate leading-tight">{label}</span>
      {showChevron ? (
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${flyoutOpen ? "translate-x-0.5" : ""} ${erpSidebarNavChevronClassName(highlighted)}`}
          aria-hidden
        />
      ) : null}
    </button>
  );
}

function SectionBlock({
  section,
  categories,
  collapsed,
  pathname,
  openCategoryId,
  onTriggerEnter,
  onTriggerLeave,
  onTriggerClick,
  onPrimaryNavigate,
}: {
  section: NavSidebarSectionConfig;
  categories: NavCategoryConfig[];
  collapsed: boolean;
  pathname: string;
  openCategoryId: string | null;
  onTriggerEnter: (id: string, el: HTMLElement) => void;
  onTriggerLeave: () => void;
  onTriggerClick: (id: string, el: HTMLElement) => void;
  onPrimaryNavigate: (path: string) => void;
}) {
  const { hasPermission, user } = useAuth();
  const role = user?.role;
  const items = section.categoryIds
    .map((id) => categoryById(id, categories))
    .filter((c): c is NavCategoryConfig => c != null)
    .filter((cat) => {
      if (cat.id === "poczta" && !userCanSeePocztaNav(hasPermission, role)) return false;
      if (cat.flyoutSections.length > 0 && !categoryHasVisibleFlyoutItems(cat, hasPermission, role)) {
        return false;
      }
      return true;
    });

  if (items.length === 0) return null;

  return (
    <div>
      {!collapsed ? <p className={ERP_SIDEBAR_SECTION_LABEL}>{section.label}</p> : null}
      <div className={collapsed ? "flex flex-col gap-1.5 px-2" : "flex flex-col gap-1.5 px-2.5"}>
        {items.map((cat) => {
          const directPath = cat.directPath?.trim();
          if (directPath) {
            const active = isCategoryActive(cat, pathname);
            const Icon = cat.Icon;
            if (collapsed) {
              return (
                <Link
                  key={cat.id}
                  to={directPath}
                  title={cat.label}
                  aria-label={cat.label}
                  aria-current={active ? "page" : undefined}
                  className={erpSidebarIconRailItemClassName(active)}
                >
                  <Icon
                    className={[
                      ERP_SIDEBAR_ICON_COLLAPSED_CLASS,
                      erpSidebarNavIconClassName(active),
                    ].join(" ")}
                    strokeWidth={active ? 2.25 : 1.75}
                    aria-hidden
                  />
                  <span className={ERP_SIDEBAR_ICON_RAIL_LABEL_CLASS}>{cat.label}</span>
                </Link>
              );
            }
            return (
              <Link
                key={cat.id}
                to={directPath}
                aria-label={cat.label}
                aria-current={active ? "page" : undefined}
                className={erpSidebarNavItemClassName(active)}
              >
                {active ? <span className={ERP_SIDEBAR_ACTIVE_BAR} aria-hidden /> : null}
                <Icon
                  className={[ERP_SIDEBAR_ICON_CLASS, erpSidebarNavIconClassName(active)].join(" ")}
                  strokeWidth={active ? 2.25 : 1.75}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate leading-tight">{cat.label}</span>
              </Link>
            );
          }

          const flyoutOpen = openCategoryId === cat.id;
          const active = isCategoryActive(cat, pathname);
          const showChevron = Boolean(cat.opensSideFlyout) && !collapsed;
          return (
            <SidebarNavButton
              key={cat.id}
              active={active}
              collapsed={collapsed}
              icon={cat.Icon}
              label={cat.label}
              showChevron={showChevron}
              flyoutOpen={flyoutOpen}
              onMouseEnter={(e) => onTriggerEnter(cat.id, e.currentTarget)}
              onMouseLeave={onTriggerLeave}
              onClick={(e) => {
                const primary = cat.primaryClickPath?.trim();
                if (primary) {
                  onPrimaryNavigate(primary);
                  return;
                }
                onTriggerClick(cat.id, e.currentTarget);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function WmsCtaButton({ collapsed }: { collapsed: boolean }) {
  const WmsIcon = WMS_SIDEBAR_DIRECT.Icon;
  const label = getLabel("navigation.wmsEntry", WMS_SIDEBAR_DIRECT.label);
  if (collapsed) {
    return (
      <Link
        to={WMS_SIDEBAR_DIRECT.path}
        title={label}
        aria-label={label}
        className={erpSidebarWmsCollapsedClassName()}
      >
        <WmsIcon className={ERP_SIDEBAR_WMS_ICON_CLASS} strokeWidth={1.75} aria-hidden />
        <span className={ERP_SIDEBAR_ICON_RAIL_LABEL_CLASS}>{label}</span>
      </Link>
    );
  }
  return (
    <Link
      to={WMS_SIDEBAR_DIRECT.path}
      className={ERP_SIDEBAR_WMS_EXPANDED_CLASS}
    >
      <WmsIcon className={`${ERP_SIDEBAR_WMS_ICON_CLASS} shrink-0 text-slate-600`} strokeWidth={1.75} aria-hidden />
      {label}
    </Link>
  );
}

/**
 * Left ERP navigation — sits below the shared app header.
 * Collapse / expand is controlled from the user menu (top bar).
 */
export default function ErpSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useLabels();
  const navCategories = buildNavFlyoutCategories();
  const { collapsed } = useErpSidebarUi();
  const {
    hoveredCategoryId,
    anchorTop,
    onTriggerEnter,
    onTriggerLeave,
    onTriggerClick,
    onPanelEnter,
    onPanelLeave,
    closeFlyout,
  } = useNavFlyout();

  useEffect(() => {
    closeFlyout();
  }, [pathname, closeFlyout]);

  const desktopWidthPx = collapsed ? ERP_SIDEBAR_COLLAPSED_WIDTH_PX : ERP_SIDEBAR_WIDTH_PX;

  const openCategory = hoveredCategoryId
    ? navCategories.find((c) => c.id === hoveredCategoryId) ?? null
    : null;

  return (
    <>
      <aside
        className={[
          "relative z-30 flex h-full min-h-0 shrink-0 flex-col transition-[width] duration-200 ease-out",
          collapsed ? ERP_SIDEBAR_COLLAPSED_WIDTH_CLASS : ERP_SIDEBAR_WIDTH_CLASS,
        ].join(" ")}
      >
        <div className={`flex h-full min-h-0 flex-col ${ERP_SIDEBAR_SURFACE}`}>
          <nav className={`min-h-0 flex-1 ${ERP_SIDEBAR_NAV_SCROLL}`} aria-label="Menu główne">
            <div className={collapsed ? "flex flex-col gap-2.5 py-3" : "flex flex-col py-3"}>
              {NAV_SIDEBAR_SECTIONS.map((section) => (
                <SectionBlock
                  key={section.id}
                  section={section}
                  categories={navCategories}
                  collapsed={collapsed}
                  pathname={pathname}
                  openCategoryId={hoveredCategoryId}
                  onTriggerEnter={(id, el) => onTriggerEnter(id, el)}
                  onTriggerLeave={onTriggerLeave}
                  onTriggerClick={(id, el) => onTriggerClick(id, el)}
                  onPrimaryNavigate={(path) => navigate(path)}
                />
              ))}
            </div>
          </nav>

          <div
            className={[
              "mt-auto shrink-0 border-t border-slate-200 bg-inherit pt-3",
              collapsed ? "px-2 pb-3" : "px-2.5 pb-3",
            ].join(" ")}
          >
            <WmsCtaButton collapsed={collapsed} />
          </div>
        </div>
      </aside>

      <NavFlyoutPanel
        category={openCategory}
        anchorTop={anchorTop}
        pathname={pathname}
        sidebarOffsetLeft={desktopWidthPx}
        onMouseEnter={onPanelEnter}
        onMouseLeave={onPanelLeave}
      />
    </>
  );
}
