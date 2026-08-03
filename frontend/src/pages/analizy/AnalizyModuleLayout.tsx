import { NavLink, Outlet, useLocation } from "react-router-dom";
import PageLayout from "../../components/layout/PageLayout";
import {
  ZARZADZANIE_MODULE_SECTIONS,
  ZARZADZANIE_ROOT,
  getActiveZarzadzanieModuleSection,
} from "../../modules/analizy/analizyModuleNav";

/** Stanowisko: Zarządzanie magazynem — hub + Pulpit · Raporty · Plan zmian */
export default function AnalizyModuleLayout() {
  const { pathname } = useLocation();
  const active = getActiveZarzadzanieModuleSection(pathname);
  const onHub = pathname === ZARZADZANIE_ROOT;

  return (
    <PageLayout fullBleed>
      <div className="mb-4 border-b border-slate-200">
        <nav className="flex flex-wrap gap-1" aria-label="Zarządzanie magazynem">
          <NavLink
            to={ZARZADZANIE_ROOT}
            end
            className={`rounded-t-lg px-3 py-2 text-sm font-medium transition-colors ${
              onHub
                ? "border-b-2 border-orange-500 text-orange-700"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            Przegląd
          </NavLink>
          {ZARZADZANIE_MODULE_SECTIONS.map((section) => {
            const isActive = active === section.id;
            return (
              <NavLink
                key={section.id}
                to={section.path}
                className={`rounded-t-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-b-2 border-orange-500 text-orange-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {section.label}
              </NavLink>
            );
          })}
        </nav>
      </div>
      <Outlet />
    </PageLayout>
  );
}
