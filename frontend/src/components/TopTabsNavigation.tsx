import { NavLink } from "react-router-dom";

export type TabItem = {
  path: string;
  label: string;
};

type TopTabsNavigationProps = {
  tabs: TabItem[];
  /** When true, each tab is active only when the route exactly matches (no prefix). Default false. */
  exact?: boolean;
  className?: string;
};

/**
 * Reusable horizontal tab navigation for WMS modules.
 * Renders NavLinks with uppercase, letter-spacing, active blue text + bottom border, hover.
 * Use under page title: PageHeader → TopTabsNavigation → PageContent.
 */
export default function TopTabsNavigation({ tabs, exact = false, className = "" }: TopTabsNavigationProps) {
  return (
    <nav
      className={`flex gap-4 border-b border-slate-200 ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={exact}
          className={({ isActive }) =>
            `px-6 py-3 text-[11px] font-black uppercase tracking-widest transition-colors border-b-2 -mb-px ${
              isActive
                ? "text-blue-600 border-blue-600"
                : "text-slate-400 border-transparent hover:text-slate-600"
            }`
          }
          role="tab"
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
