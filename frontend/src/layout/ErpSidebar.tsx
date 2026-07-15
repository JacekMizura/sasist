import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronsLeft, ChevronsRight, Menu, X, type LucideIcon } from "lucide-react";
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
  ERP_SIDEBAR_COLLAPSE_STORAGE_KEY,
  ERP_SIDEBAR_ICON_CLASS,
  ERP_SIDEBAR_ICON_COLLAPSED_CLASS,
  ERP_SIDEBAR_ITEM_ACTIVE,
  ERP_SIDEBAR_ITEM_BASE,
  ERP_SIDEBAR_ITEM_HOVER,
  ERP_SIDEBAR_ITEM_INACTIVE,
  ERP_SIDEBAR_MOBILE_WIDTH_CLASS,
  ERP_SIDEBAR_MOBILE_WIDTH_PX,
  ERP_SIDEBAR_NAV_SCROLL,
  ERP_SIDEBAR_SECTION_LABEL,
  ERP_SIDEBAR_SURFACE,
  ERP_SIDEBAR_WIDTH_CLASS,
  ERP_SIDEBAR_WIDTH_PX,
} from "./erpSidebarStyles";
import { useNavFlyout } from "./useNavFlyout";
import NavFlyoutPanel from "./NavFlyoutPanel";

function readCollapsedPreference(): boolean {
  try {
    return localStorage.getItem(ERP_SIDEBAR_COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

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

type ErpSidebarChromeProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile?: () => void;
  showCollapseToggle: boolean;
  pathname: string;
  onTriggerEnter: (id: string, el: HTMLElement) => void;
  onTriggerLeave: () => void;
};

function ErpSidebarChrome({
  collapsed,
  onToggleCollapsed,
  onCloseMobile,
  showCollapseToggle,
  pathname,
  onTriggerEnter,
  onTriggerLeave,
}: ErpSidebarChromeProps) {
  const mainSections = NAV_SIDEBAR_SECTIONS.filter((s) => !s.pinToBottom);
  const bottomSections = NAV_SIDEBAR_SECTIONS.filter((s) => s.pinToBottom);

  return (
    <div className={`flex h-full min-h-0 flex-col ${ERP_SIDEBAR_SURFACE}`}>
      <div
        className={[
          "flex h-14 shrink-0 items-center gap-2 border-b border-[#E2E8F0]",
          collapsed ? "justify-center px-2" : "px-4",
        ].join(" ")}
      >
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <ErpCompactBrandLink />
          </div>
        ) : (
          <ErpCompactBrandLink collapsed />
        )}
        {onCloseMobile ? (
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-orange-50 hover:text-orange-600"
            aria-label="Zamknij menu"
            onClick={onCloseMobile}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        ) : null}
        {showCollapseToggle && !onCloseMobile ? (
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-orange-50 hover:text-orange-600"
            aria-label={collapsed ? "Rozwiń menu" : "Zwiń menu"}
            onClick={onToggleCollapsed}
          >
            {collapsed ? (
              <ChevronsRight className="h-5 w-5" aria-hidden />
            ) : (
              <ChevronsLeft className="h-5 w-5" aria-hidden />
            )}
          </button>
        ) : null}
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
                onTriggerEnter={onTriggerEnter}
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
                onTriggerEnter={onTriggerEnter}
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
  );
}

export type ErpSidebarProps = {
  /** Current sidebar width in px (for fly-out offset). */
  onWidthChange?: (widthPx: number) => void;
};

/**
 * Left ERP navigation — sections, sticky MAGAZYN/WMS, collapse, mobile drawer.
 */
export default function ErpSidebar({ onWidthChange }: ErpSidebarProps) {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);
  const [mobileOpen, setMobileOpen] = useState(false);
  const {
    hoveredCategoryId,
    anchorTop,
    onTriggerEnter,
    onTriggerLeave,
    onPanelEnter,
    onPanelLeave,
  } = useNavFlyout();

  const desktopWidthPx = collapsed ? ERP_SIDEBAR_COLLAPSED_WIDTH_PX : ERP_SIDEBAR_WIDTH_PX;

  useEffect(() => {
    onWidthChange?.(desktopWidthPx);
  }, [desktopWidthPx, onWidthChange]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(ERP_SIDEBAR_COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const openCategory = useMemo(
    () => (hoveredCategoryId ? NAV_FLYOUT_CATEGORIES.find((c) => c.id === hoveredCategoryId) ?? null : null),
    [hoveredCategoryId],
  );

  const flyoutLeft = (typeof window !== "undefined" && window.innerWidth < 1024
    ? ERP_SIDEBAR_MOBILE_WIDTH_PX
    : desktopWidthPx) + 8;

  const chromeProps: Omit<ErpSidebarChromeProps, "collapsed" | "showCollapseToggle" | "onCloseMobile"> = {
    onToggleCollapsed: toggleCollapsed,
    pathname,
    onTriggerEnter: (id, el) => onTriggerEnter(id, el),
    onTriggerLeave,
  };

  return (
    <>
      {/* Desktop / tablet sidebar */}
      <aside
        className={[
          "relative z-20 hidden h-screen shrink-0 flex-col lg:flex",
          collapsed ? ERP_SIDEBAR_COLLAPSED_WIDTH_CLASS : ERP_SIDEBAR_WIDTH_CLASS,
        ].join(" ")}
      >
        <ErpSidebarChrome {...chromeProps} collapsed={collapsed} showCollapseToggle />
      </aside>

      {/* Mobile open control (portaled next to main chrome via shell) */}
      <button
        type="button"
        className="fixed left-3 top-3 z-[55] inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-slate-700 shadow-sm hover:bg-orange-50 hover:text-orange-600 lg:hidden"
        aria-label="Otwórz menu"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {mobileOpen && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[69] bg-black/30 lg:hidden"
                role="presentation"
                aria-hidden
                onClick={() => setMobileOpen(false)}
              />
              <aside
                className={`fixed inset-y-0 left-0 z-[70] flex h-screen ${ERP_SIDEBAR_MOBILE_WIDTH_CLASS} flex-col bg-white shadow-2xl lg:hidden`}
              >
                <ErpSidebarChrome
                  {...chromeProps}
                  collapsed={false}
                  showCollapseToggle={false}
                  onCloseMobile={() => setMobileOpen(false)}
                />
              </aside>
            </>,
            document.body,
          )
        : null}

      <NavFlyoutPanel
        category={openCategory}
        anchorTop={anchorTop}
        pathname={pathname}
        sidebarOffsetLeft={mobileOpen ? ERP_SIDEBAR_MOBILE_WIDTH_PX + 8 : flyoutLeft}
        onMouseEnter={onPanelEnter}
        onMouseLeave={onPanelLeave}
      />
    </>
  );
}
