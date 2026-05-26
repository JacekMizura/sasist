import { NavLink, useLocation } from "react-router-dom";

export type TabsNavItem = {
  path: string;
  label: string;
  /**
   * Passed to NavLink `end`. When omitted, falls back to module-level `exact`.
   */
  end?: boolean;
  /** When set, tab is active if `pathname` equals any entry OR NavLink reports active. */
  activePaths?: string[];
};

export type TabsNavProps = {
  items: TabsNavItem[];
  /** Appended to each tab path (e.g. `?tenant_id=1`). */
  tabLinkSearch?: string;
  /** Default for NavLink `end` when a tab omits `end`. */
  exact?: boolean;
  /** `segmented` — pill row (WMS / Dokumenty); `underline` — legacy border-bottom tabs. */
  variant?: "underline" | "segmented";
  /** Extra classes on the `<nav>` (e.g. `w-full overflow-x-auto`). */
  className?: string;
  /** Larger tabs for operational modules (e.g. automation). */
  tabSize?: "default" | "comfortable";
  "aria-label"?: string;
};

function tabHref(tab: TabsNavItem, tabLinkSearch: string | undefined): string {
  if (!tabLinkSearch || !tabLinkSearch.trim()) return tab.path;
  return `${tab.path}${tabLinkSearch.startsWith("?") ? tabLinkSearch : `?${tabLinkSearch}`}`;
}

export function tabsNavItemClassName(isActive: boolean, tabSize: "default" | "comfortable" = "default"): string {
  const size =
    tabSize === "comfortable"
      ? "pb-2.5 text-base font-semibold border-b-[3px] -mb-px"
      : "pb-2.5 text-sm font-medium border-b-2 -mb-px";
  return `${size} transition-colors ${
    isActive ? "border-orange-500 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
  }`;
}

export function tabsNavSegmentedItemClassName(isActive: boolean): string {
  return [
    "inline-flex shrink-0 items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold transition-all",
    isActive
      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/90"
      : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900",
  ].join(" ");
}

/**
 * Shared underline tab row for module and settings navigation.
 */
export function TabsNav({
  items,
  tabLinkSearch,
  exact = false,
  variant = "underline",
  className = "",
  tabSize = "default",
  "aria-label": ariaLabel,
}: TabsNavProps) {
  const { pathname } = useLocation();
  if (variant === "segmented") {
    return (
      <nav
        className={`inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-slate-200/90 bg-slate-100/90 p-1 shadow-inner ${className}`.trim()}
        aria-label={ariaLabel}
        role="tablist"
      >
        {items.map((tab) => (
          <NavLink
            key={tab.path}
            to={tabHref(tab, tabLinkSearch)}
            end={tab.end ?? exact}
            className={({ isActive: linkActive }) => {
              const pathActive = tab.activePaths?.some((p) => p === pathname) ?? false;
              return tabsNavSegmentedItemClassName(pathActive || linkActive);
            }}
            role="tab"
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
    <nav
      className={`flex gap-6 border-b border-slate-200 ${className}`.trim()}
      aria-label={ariaLabel}
      role="tablist"
    >
      {items.map((tab) => (
        <NavLink
          key={tab.path}
          to={tabHref(tab, tabLinkSearch)}
          end={tab.end ?? exact}
          className={({ isActive: linkActive }) => {
            const pathActive = tab.activePaths?.some((p) => p === pathname) ?? false;
            return tabsNavItemClassName(pathActive || linkActive, tabSize);
          }}
          role="tab"
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
