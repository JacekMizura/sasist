import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { NavCategoryConfig, NavFlyoutLinkConfig } from "./mainNavConfig";
import { isNavPathActive } from "./navActive";
import { isSuperRole } from "../auth/isSuperRole";
import { useAuth } from "../context/AuthContext";
import { useLabels } from "../labels";
import {
  brandSidebarNavActiveBarClassName,
  brandSidebarNavIconClassName,
} from "../design-system/brandUi";
import {
  ERP_FLYOUT_WIDTH_PX,
  ERP_SIDEBAR_WIDTH_PX,
  erpSidebarFlyoutRowClassName,
} from "./erpSidebarStyles";

const FLYOUT_ICON = 20;
const VIEWPORT_MARGIN = 8;

const plusBtnClass =
  "relative z-[210] flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800";

function FlyoutRow({
  item,
  pathname,
}: {
  item: NavFlyoutLinkConfig;
  pathname: string;
}) {
  const { user, hasPermission } = useAuth();
  if (item.superRoleOnly && !isSuperRole(user?.role ?? "")) {
    return null;
  }
  const anyPerms = item.permissionsAny?.filter(Boolean) ?? [];
  const allowLink =
    anyPerms.length > 0
      ? anyPerms.some((k) => hasPermission(k)) || isSuperRole(user?.role ?? "")
      : !item.permission || hasPermission(item.permission) || isSuperRole(user?.role ?? "");
  if (!allowLink) {
    return null;
  }
  const Icon = item.Icon;
  const active = !item.openInNewTab && isNavPathActive(pathname, item.path);
  const plusTarget = item.plusLinkTo?.trim();
  const rowActive =
    active || (plusTarget != null && plusTarget !== "" && isNavPathActive(pathname, plusTarget));
  const linkPartClass = erpSidebarFlyoutRowClassName(rowActive);

  const iconWrap = (
    <span className={brandSidebarNavIconClassName(rowActive)}>
      <Icon size={FLYOUT_ICON} strokeWidth={rowActive ? 2.25 : 1.75} />
    </span>
  );

  if (item.openInNewTab) {
    return (
      <a href={item.path} target="_blank" rel="noopener noreferrer" className={linkPartClass}>
        {rowActive ? <span className={brandSidebarNavActiveBarClassName} aria-hidden /> : null}
        {iconWrap}
        {item.label}
      </a>
    );
  }

  if (plusTarget) {
    return (
      <div
        className={`relative flex min-h-10 items-center gap-1 rounded-xl py-0.5 pr-1 pl-0.5 transition-colors duration-150 ${
          rowActive ? "bg-orange-50/50" : "hover:bg-slate-100"
        }`}
      >
        {rowActive ? <span className={brandSidebarNavActiveBarClassName} aria-hidden /> : null}
        <Link to={item.path} className={`${linkPartClass} bg-transparent`}>
          {iconWrap}
          <span className="min-w-0 truncate">{item.label}</span>
        </Link>
        <Link to={plusTarget} title={item.plusLinkTitle ?? "Dodaj"} className={plusBtnClass}>
          <Plus size={16} strokeWidth={2.5} aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <Link to={item.path} className={linkPartClass}>
      {rowActive ? <span className={brandSidebarNavActiveBarClassName} aria-hidden /> : null}
      {iconWrap}
      <span className="min-w-0 truncate">{item.label}</span>
    </Link>
  );
}

type NavFlyoutPanelProps = {
  category: NavCategoryConfig | null;
  anchorTop: number;
  pathname: string;
  /** Left edge offset in px (expanded / collapsed sidebar). */
  sidebarOffsetLeft?: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

/**
 * Side fly-out for sidebar categories (Magazyn, etc.) —
 * anchored next to the rail, not an accordion.
 */
export default function NavFlyoutPanel({
  category,
  anchorTop,
  pathname,
  sidebarOffsetLeft = ERP_SIDEBAR_WIDTH_PX,
  onMouseEnter,
  onMouseLeave,
}: NavFlyoutPanelProps) {
  useLabels();
  const panelRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchorTop);
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    if (!category) {
      setVisible(false);
      setTop(anchorTop);
      return;
    }
    setVisible(true);
    const measure = () => {
      if (!panelRef.current) {
        setTop(anchorTop);
        return;
      }
      const el = panelRef.current;
      const h = el.getBoundingClientRect().height;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const maxTop = vh - VIEWPORT_MARGIN - h;
      const next = Math.min(Math.max(VIEWPORT_MARGIN, anchorTop), Math.max(VIEWPORT_MARGIN, maxTop));
      setTop(next);
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [category, anchorTop, pathname]);

  if (!category) return null;

  return (
    <div
      ref={panelRef}
      data-erp-nav-flyout
      role="navigation"
      aria-label={category.label}
      className={[
        "fixed z-[200] flex max-h-[calc(100vh-16px)] flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl transition-all duration-200 ease-out",
        "rounded-r-3xl rounded-l-none",
        visible ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-1 opacity-0",
      ].join(" ")}
      style={{
        left: sidebarOffsetLeft,
        top,
        width: ERP_FLYOUT_WIDTH_PX,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{category.label}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
        {category.flyoutSections.map((section, si) => (
          <div key={si}>
            {si > 0 ? <div className="my-2 border-t border-slate-100" role="separator" /> : null}
            {section.title ? (
              <div className="mb-1.5 px-2 pt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {section.title}
              </div>
            ) : null}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <FlyoutRow key={`${item.path}-${item.label}`} item={item} pathname={pathname} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
