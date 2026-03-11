import { NavLink, Outlet, useLocation } from "react-router-dom";
import PageLayout from "../../components/layout/PageLayout";
import {
  ANALYTICS_TOP_TABS,
  getSubNavForPath,
  type SubNavItem,
} from "../../modules/analytics/analyticsTabs";

function AnalyticsTabBar() {
  const { pathname } = useLocation();
  return (
    <nav
      className="flex gap-4 border-b border-slate-200 mb-0"
      role="tablist"
    >
      {ANALYTICS_TOP_TABS.map((tab) => {
        const isActive = tab.activePaths.some((p) => pathname === p);
        return (
          <NavLink
            key={tab.id}
            to={tab.path}
            end={tab.id === "dashboard"}
            className={({ isActive: linkActive }) =>
              `px-6 py-3 text-[11px] font-black uppercase tracking-widest transition-colors border-b-2 -mb-px ${
                isActive || linkActive
                  ? "text-blue-600 border-blue-600"
                  : "text-slate-400 border-transparent hover:text-slate-600"
              }`
            }
            role="tab"
          >
            {tab.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

function SubNav({ items }: { items: SubNavItem[] }) {
  const { pathname } = useLocation();
  return (
    <nav className="flex flex-col gap-0.5 w-56 shrink-0">
      {items.map((item) => {
        const isActive = pathname === item.path;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={`block py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              isActive ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

/**
 * Analytics module layout: one sidebar entry "Analiza", top tabs (Dashboard, Analityka, Symulacje, Optymalizacja, Mapy),
 * and per-tab sub-navigation. Same pattern as Wózki (Carts).
 */
export default function AnalyticsLayout() {
  const { pathname } = useLocation();
  const subNav = getSubNavForPath(pathname);
  const isDashboard = pathname === "/analytics" || pathname === "/analytics/dashboard";

  return (
    <PageLayout
      title="Analiza"
      actions={<AnalyticsTabBar />}
    >
      <div className="min-h-[600px] w-full relative flex gap-6">
        {!isDashboard && subNav && (
          <aside className="shrink-0">
            <SubNav items={subNav} />
          </aside>
        )}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </PageLayout>
  );
}
