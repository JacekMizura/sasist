import { NavLink, Outlet, useLocation } from "react-router-dom";
import { getAnalizySubNav, type SubNavItem } from "../../modules/analytics/analyticsTabs";
import { ZARZADZANIE_REPORTS_ENTRY } from "../../modules/analizy/analizyModuleNav";
import {
  analizySideNavActiveClass,
  analizySideNavIdleClass,
} from "../../modules/analizy/analizyUi";

function SubNav({ items }: { items: SubNavItem[] }) {
  const { pathname } = useLocation();
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-0.5" aria-label="Raporty">
      {items.map((item) => {
        const isActive =
          item.path === ZARZADZANIE_REPORTS_ENTRY
            ? pathname === ZARZADZANIE_REPORTS_ENTRY || pathname === `${ZARZADZANIE_REPORTS_ENTRY}/`
            : pathname === item.path;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === ZARZADZANIE_REPORTS_ENTRY}
            className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? analizySideNavActiveClass : analizySideNavIdleClass
            }`}
          >
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

/** Raporty: Przegląd + indeks analiz (boczne menu). */
export default function AnalyticsLayout() {
  const { pathname } = useLocation();
  const subNav = getAnalizySubNav(pathname);

  return (
    <div className="relative flex min-h-[600px] w-full min-w-0 gap-6">
      {subNav != null ? (
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
