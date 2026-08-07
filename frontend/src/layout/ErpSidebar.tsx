import { useEffect, type LucideIcon } from "react";
import { ChevronRight, Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import HeaderLogo from "../components/layout/topbar/HeaderLogo";
import UserAccountMenu from "../components/layout/UserAccountMenu";
import {
  buildNavFlyoutCategories,
  NAV_SIDEBAR_SECTIONS,
  WMS_SIDEBAR_DIRECT,
  isCategoryActive,
  type NavCategoryConfig,
  type NavSidebarSectionConfig,
} from "./mainNavConfig";
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
}: {
  section: NavSidebarSectionConfig;
  categories: NavCategoryConfig[];
  collapsed: boolean;
  pathname: string;
  openCategoryId: string | null;
  onTriggerEnter: (id: string, el: HTMLElement) => void;
  onTriggerLeave: () => void;
  onTriggerClick: (id: string, el: HTMLElement) => void;
}) {
  const items = section.categoryIds
    .map((id) => categoryById(id, categories))
    .filter((c): c is NavCategoryConfig => c != null);

  if (items.length === 0) return null;

  return (
    <div>
      {!collapsed ? <p className={ERP_SIDEBAR_SECTION_LABEL}>{section.label}</p> : null}
      <div className={collapsed ? "flex flex-col gap-1 px-1.5" : "flex flex-col gap-1 px-2"}>
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
              onClick={(e) => onTriggerClick(cat.id, e.currentTarget)}
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
        className="mx-auto flex w-full max-w-[4.5rem] flex-col items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1 py-2 text-slate-700 transition-colors duration-150 ease-out hover:bg-slate-50 hover:text-slate-900"
      >
        <WmsIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        <span className={ERP_SIDEBAR_ICON_RAIL_LABEL_CLASS}>{label}</span>
      </Link>
    );
  }
  return (
    <Link
      to={WMS_SIDEBAR_DIRECT.path}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 transition-colors duration-150 ease-out hover:bg-slate-50 hover:text-slate-900"
    >
      <WmsIcon className="h-5 w-5 shrink-0 text-slate-600" strokeWidth={1.75} aria-hidden />
      {label}
    </Link>
  );
}

/**
 * Left ERP navigation — default: narrow icon rail; toggle expands full labels.
 */
export default function ErpSidebar() {
  const { pathname } = useLocation();
  useLabels();
  const navCategories = buildNavFlyoutCategories();
  const { collapsed, toggleCollapsed } = useErpSidebarUi();
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
          "relative z-30 flex h-screen shrink-0 flex-col",
          collapsed ? ERP_SIDEBAR_COLLAPSED_WIDTH_CLASS : ERP_SIDEBAR_WIDTH_CLASS,
        ].join(" ")}
      >
        <div className={`flex h-full min-h-0 flex-col ${ERP_SIDEBAR_SURFACE}`}>
          <div
            className={[
              "flex h-14 shrink-0 items-center border-b border-slate-200",
              collapsed ? "justify-center px-1" : "gap-1 px-2",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={toggleCollapsed}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors duration-150 ease-out hover:bg-white hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
              aria-label={collapsed ? "Rozwiń menu boczne" : "Zwiń menu boczne"}
              title={collapsed ? "Rozwiń menu" : "Zwiń menu"}
            >
              <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <HeaderLogo compact />
              </div>
            ) : null}
          </div>

          <nav className={`min-h-0 flex-1 ${ERP_SIDEBAR_NAV_SCROLL}`} aria-label="Menu główne">
            <div className={collapsed ? "flex flex-col gap-2 py-2" : "flex flex-col pb-2"}>
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
                />
              ))}
            </div>
          </nav>

          <div
            className={[
              "mt-auto shrink-0 space-y-2 border-t border-slate-200 bg-inherit pt-3",
              collapsed ? "px-1.5 pb-3" : "px-2 pb-3",
            ].join(" ")}
          >
            <WmsCtaButton collapsed={collapsed} />
            <UserAccountMenu variant="sidebar" collapsed={collapsed} />
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
