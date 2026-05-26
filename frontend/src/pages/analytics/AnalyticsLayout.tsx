import { NavLink, Outlet, useLocation } from "react-router-dom";
import PageLayout from "../../components/layout/PageLayout";
import { TabsContainer } from "../../components/layout/TabsContainer";
import { TabsNav } from "../../components/layout/TabsNav";
import {
  ANALYTICS_TOP_TABS,
  getSubNavForPath,
  type SubNavItem,
} from "../../modules/analytics/analyticsTabs";

const ANALYTICS_TABS_NAV_ITEMS = ANALYTICS_TOP_TABS.map((tab) => ({
  path: tab.path,
  label: tab.label,
  end: tab.id === "dashboard",
  activePaths: tab.activePaths,
}));

function AnalyticsTabBar() {
  return (
    <TabsContainer className="w-full max-w-full [-webkit-overflow-scrolling:touch]">
      <TabsNav items={ANALYTICS_TABS_NAV_ITEMS} className="min-w-0 w-full overflow-x-auto" aria-label="Analiza — zakładki" />
    </TabsContainer>
  );
}

function SubNav({ items }: { items: SubNavItem[] }) {
  const { pathname } = useLocation();
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-0.5">
      {items.map((item) => {
        const isActive = pathname === item.path;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
 * Analytics module: top tabs + optional sub-nav + outlet.
 */
export default function AnalyticsLayout() {
  const { pathname } = useLocation();
  const subNav = getSubNavForPath(pathname);
  const isDashboard = pathname === "/analytics" || pathname === "/analytics/dashboard";

  return (
    <PageLayout fullBleed>
      <AnalyticsTabBar />
      <div className="relative flex min-h-[600px] w-full min-w-0 gap-6">
        {!isDashboard && subNav != null ? (
          <aside className="shrink-0">
            <SubNav items={subNav} />
          </aside>
        ) : null}
        <div className="flex min-h-[600px] min-w-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </PageLayout>
  );
}
