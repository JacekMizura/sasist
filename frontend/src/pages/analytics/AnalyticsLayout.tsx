import { NavLink, Outlet, useLocation } from "react-router-dom";
import { getAnalizySubNav, type SubNavItem } from "../../modules/analytics/analyticsTabs";

function SubNav({ items }: { items: SubNavItem[] }) {
  const { pathname } = useLocation();
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-0.5" aria-label="Analizy — raporty">
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
 * Sekcja raportów Analiz — pod nawigacją hubu (PageLayout w AnalizyModuleLayout).
 */
export default function AnalyticsLayout() {
  const { pathname } = useLocation();
  const subNav = getAnalizySubNav(pathname);
  const isLanding = pathname === "/analytics" || pathname === "/analytics/dashboard";

  return (
    <div className="relative flex min-h-[600px] w-full min-w-0 gap-6">
      {!isLanding && subNav != null ? (
        <aside className="shrink-0">
          <SubNav items={subNav} />
        </aside>
      ) : null}
      <div className="flex min-h-[600px] min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
