import { useMemo, type LucideIcon } from "react";
import { useLocation } from "react-router-dom";

import ErpCompactBrandLink from "../components/layout/ErpCompactBrandLink";
import UserAccountMenu from "../components/layout/UserAccountMenu";
import {
  NAV_FLYOUT_CATEGORIES,
  NAV_SIDEBAR_SECTIONS,
  isCategoryActive,
  type NavCategoryConfig,
  type NavSidebarSectionConfig,
} from "./mainNavConfig";
import {
  ERP_SIDEBAR_COLLAPSED_WIDTH_CLASS,
  ERP_SIDEBAR_COLLAPSED_WIDTH_PX,
  ERP_SIDEBAR_ICON_CLASS,
  ERP_SIDEBAR_ICON_COLLAPSED_CLASS,
  ERP_SIDEBAR_ITEM_ACTIVE,
  ERP_SIDEBAR_ITEM_BASE,
  ERP_SIDEBAR_ITEM_HOVER,
  ERP_SIDEBAR_ITEM_INACTIVE,
  ERP_SIDEBAR_NAV_SCROLL,
  ERP_SIDEBAR_SECTION_LABEL,
  ERP_SIDEBAR_SURFACE,
  ERP_SIDEBAR_WIDTH_CLASS,
  ERP_SIDEBAR_WIDTH_PX,
} from "./erpSidebarStyles";
import { useErpSidebarUi } from "./ErpSidebarUiContext";
import { useNavFlyout } from "./useNavFlyout";
import NavFlyoutPanel from "./NavFlyoutPanel";

function categoryById(id: string): NavCategoryConfig | undefined {
  return NAV_FLYOUT_CATEGORIES.find((c) => c.id === id);
}

type SidebarNavButtonProps = {
  active: boolean;
  collapsed: boolean;
  icon: LucideIcon;
  label: string;
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave: () => void;
};

function SidebarNavButton({
  active,
  collapsed,
  icon: Icon,
  label,
  onMouseEnter,
  onMouseLeave,
}: SidebarNavButtonProps) {
  return (
    <button
      type="button"
      title={collapsed ? label : undefined}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={[
        ERP_SIDEBAR_ITEM_BASE,
        active ? ERP_SIDEBAR_ITEM_ACTIVE : `${ERP_SIDEBAR_ITEM_INACTIVE} ${ERP_SIDEBAR_ITEM_HOVER}`,
        collapsed ? "justify-center px-0" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Icon
        className={collapsed ? ERP_SIDEBAR_ICON_COLLAPSED_CLASS : ERP_SIDEBAR_ICON_CLASS}
        strokeWidth={active ? 2.25 : 1.75}
        aria-hidden
      />
      {!collapsed ? <span className="min-w-0 flex-1 truncate text-[15px] leading-tight">{label}</span> : null}
    </button>
  );
}

function SectionBlock({
  section,
  collapsed,
  pathname,
  onTriggerEnter,
  onTriggerLeave,
}: {
  section: NavSidebarSectionConfig;
  collapsed: boolean;
  pathname: string;
  onTriggerEnter: (id: string, el: HTMLElement) => void;
  onTriggerLeave: () => void;
}) {
  const items = section.categoryIds
    .map((id) => categoryById(id))
    .filter((c): c is NavCategoryConfig => c != null);

  if (items.length === 0) return null;

  return (
    <div>
      {!collapsed ? <p className={ERP_SIDEBAR_SECTION_LABEL}>{section.label}</p> : null}
      <div className="flex flex-col gap-1 px-2">
        {items.map((cat) => (
          <SidebarNavButton
            key={cat.id}
            active={isCategoryActive(cat, pathname)}
            collapsed={collapsed}
            icon={cat.Icon}
            label={cat.label}
            onMouseEnter={(e) => onTriggerEnter(cat.id, e.currentTarget)}
            onMouseLeave={onTriggerLeave}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Left ERP navigation — sections, sticky MAGAZYN/WMS, collapse via top-bar hamburger.
 * Desktop-first; no mobile overlay drawer.
 */
export default function ErpSidebar() {
  const { pathname } = useLocation();
  const { collapsed } = useErpSidebarUi();
  const {
    hoveredCategoryId,
    anchorTop,
    onTriggerEnter,
    onTriggerLeave,
    onPanelEnter,
    onPanelLeave,
  } = useNavFlyout();

  const desktopWidthPx = collapsed ? ERP_SIDEBAR_COLLAPSED_WIDTH_PX : ERP_SIDEBAR_WIDTH_PX;

  const mainSections = NAV_SIDEBAR_SECTIONS.filter((s) => !s.pinToBottom);
  const bottomSections = NAV_SIDEBAR_SECTIONS.filter((s) => s.pinToBottom);

  const openCategory = useMemo(
    () => (hoveredCategoryId ? NAV_FLYOUT_CATEGORIES.find((c) => c.id === hoveredCategoryId) ?? null : null),
    [hoveredCategoryId],
  );

  return (
    <>
      <aside
        className={[
          "relative z-20 flex h-screen shrink-0 flex-col",
          collapsed ? ERP_SIDEBAR_COLLAPSED_WIDTH_CLASS : ERP_SIDEBAR_WIDTH_CLASS,
        ].join(" ")}
      >
        <div className={`flex h-full min-h-0 flex-col ${ERP_SIDEBAR_SURFACE}`}>
          <div
            className={[
              "flex h-14 shrink-0 items-center border-b border-[#E2E8F0]",
              collapsed ? "justify-center px-2" : "px-4",
            ].join(" ")}
          >
            <ErpCompactBrandLink collapsed={collapsed} />
          </div>

          <nav className={`min-h-0 flex-1 ${ERP_SIDEBAR_NAV_SCROLL}`} aria-label="Menu główne">
            <div className="flex min-h-full flex-col pb-2">
              <div className="flex flex-col">
                {mainSections.map((section) => (
                  <SectionBlock
                    key={section.id}
                    section={section}
                    collapsed={collapsed}
                    pathname={pathname}
                    onTriggerEnter={(id, el) => onTriggerEnter(id, el)}
                    onTriggerLeave={onTriggerLeave}
                  />
                ))}
              </div>

              <div className="mt-auto border-t border-[#E2E8F0] pt-6">
                {bottomSections.map((section) => (
                  <SectionBlock
                    key={section.id}
                    section={section}
                    collapsed={collapsed}
                    pathname={pathname}
                    onTriggerEnter={(id, el) => onTriggerEnter(id, el)}
                    onTriggerLeave={onTriggerLeave}
                  />
                ))}
              </div>
            </div>
          </nav>

          <div
            className={[
              "shrink-0 border-t border-[#E2E8F0] bg-white pt-4",
              collapsed ? "flex justify-center px-2 pb-4" : "px-4 pb-4",
            ].join(" ")}
          >
            <UserAccountMenu variant="sidebar" collapsed={collapsed} />
          </div>
        </div>
      </aside>

      <NavFlyoutPanel
        category={openCategory}
        anchorTop={anchorTop}
        pathname={pathname}
        sidebarOffsetLeft={desktopWidthPx + 8}
        onMouseEnter={onPanelEnter}
        onMouseLeave={onPanelLeave}
      />
    </>
  );
}
