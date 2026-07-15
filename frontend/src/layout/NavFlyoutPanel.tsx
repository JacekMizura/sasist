import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { NavCategoryConfig, NavFlyoutLinkConfig } from "./mainNavConfig";
import { isNavPathActive } from "./navActive";
import { isSuperRole } from "../auth/isSuperRole";
import { useAuth } from "../context/AuthContext";

import { ERP_SIDEBAR_WIDTH_PX } from "./erpSidebarStyles";

const FLYOUT_ICON = 17;
const VIEWPORT_MARGIN = 8;

const plusBtnClass =
  "relative z-[210] flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800";

function FlyoutRow({
  item,
  pathname,
}: {
  item: NavFlyoutLinkConfig;
  pathname: string;
}) {
  const { user, hasPermission } = useAuth();
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
  const linkPartClass = `flex h-9 min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors [&_svg]:shrink-0 ${
    rowActive ? "bg-blue-100 text-blue-900" : "text-slate-700 hover:bg-blue-50"
  }`;

  const iconWrap = (
    <span className="text-slate-500 [&_svg]:h-[17px] [&_svg]:w-[17px]">
      <Icon size={FLYOUT_ICON} />
    </span>
  );

  if (item.openInNewTab) {
    return (
      <a href={item.path} target="_blank" rel="noopener noreferrer" className={linkPartClass}>
        {iconWrap}
        {item.label}
      </a>
    );
  }

  if (plusTarget) {
    return (
      <div
        className={`flex h-9 min-h-9 items-center gap-1 rounded-md py-0.5 pr-1 pl-0.5 transition-colors ${
          rowActive ? "bg-blue-100/80" : "hover:bg-blue-50"
        }`}
      >
        <Link to={item.path} className={linkPartClass}>
          {iconWrap}
          <span className="min-w-0 truncate">{item.label}</span>
        </Link>
        <Link
          to={plusTarget}
          title={item.plusLinkTitle ?? "Dodaj"}
          className={plusBtnClass}
          onClick={(e) => {
            e.stopPropagation();
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.log("[Nav] ADD USER — sidebar + →", plusTarget);
            }
          }}
        >
          <Plus size={16} strokeWidth={2.5} aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <Link to={item.path} className={linkPartClass}>
      {iconWrap}
      {item.label}
    </Link>
  );
}

type NavFlyoutPanelProps = {
  category: NavCategoryConfig | null;
  anchorTop: number;
  pathname: string;
  /** Left edge offset in px (expanded / collapsed / mobile drawer). */
  sidebarOffsetLeft?: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

export default function NavFlyoutPanel({
  category,
  anchorTop,
  pathname,
  sidebarOffsetLeft = ERP_SIDEBAR_WIDTH_PX + 8,
  onMouseEnter,
  onMouseLeave,
}: NavFlyoutPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchorTop);

  useLayoutEffect(() => {
    if (!category) {
      setTop(anchorTop);
      return;
    }
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
      role="navigation"
      aria-label={category.label}
      className="fixed z-[200] flex min-h-0 min-w-[220px] max-w-[300px] max-h-[calc(100vh-16px)] flex-col overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-200/80"
      style={{
        left: sidebarOffsetLeft,
        top,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/90">
        {category.flyoutSections.map((section, si) => (
          <div key={si}>
            {si > 0 ? <div className="my-1.5 border-t border-slate-200" role="separator" /> : null}
            {section.title ? (
              <div className="mb-1 px-1 pt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
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
