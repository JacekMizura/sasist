import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  getOptymalizacjaSubNav,
  type OptimizeSubNavItem,
} from "../../modules/optymalizacja/optymalizacjaNav";
import {
  analizySideNavActiveClass,
  analizySideNavIdleClass,
} from "../../modules/analizy/analizyUi";

function SubNav({ items }: { items: OptimizeSubNavItem[] }) {
  const { pathname } = useLocation();
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-0.5" aria-label="Optymalizacja — plan zmian">
      {items.map((item) => {
        const isActive =
          item.path === "/optymalizacja"
            ? pathname === "/optymalizacja" || pathname === "/optymalizacja/"
            : pathname === item.path;
        return (
          <NavLink
            key={item.path}
            to={item.path}
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

/** Sekcja Optymalizacja — pod nawigacją hubu Analizy. */
export default function OptymalizacjaLayout() {
  const { pathname } = useLocation();
  const subNav = getOptymalizacjaSubNav(pathname);

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
