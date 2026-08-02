import { NavLink, Outlet, useLocation } from "react-router-dom";
import PageLayout from "../../components/layout/PageLayout";
import {
  ANALIZY_MODULE_SECTIONS,
  getActiveAnalizyModuleSection,
} from "../../modules/analizy/analizyModuleNav";

/**
 * Wspólna skorupa hubu Analizy — sekcje wewnętrzne, bez zmiany routingu.
 */
export default function AnalizyModuleLayout() {
  const { pathname } = useLocation();
  const active = getActiveAnalizyModuleSection(pathname);

  return (
    <PageLayout fullBleed>
      <div className="mb-4 border-b border-slate-200">
        <nav
          className="flex flex-wrap gap-1"
          aria-label="Analizy — sekcje modułu"
        >
          {ANALIZY_MODULE_SECTIONS.map((section) => {
            const isActive = active === section.id;
            return (
              <NavLink
                key={section.id}
                to={section.path}
                end={section.id === "przeglad"}
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
