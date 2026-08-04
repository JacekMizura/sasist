import { Outlet, useLocation } from "react-router-dom";
import { TabsNav } from "../../components/layout/TabsNav";
import { getAnalizySubNav } from "../../modules/analytics/analyticsTabs";
import { ZARZADZANIE_REPORTS_ENTRY } from "../../modules/analizy/analizyModuleNav";

/**
 * Raporty — top underline tabs (SASIST), bez lewego menu.
 * Shell = AnalizyModuleLayout → PageLayout.
 */
export default function AnalyticsLayout() {
  const { pathname } = useLocation();
  const subNav = getAnalizySubNav(pathname);

  return (
    <div className="min-w-0 space-y-4">
      {subNav != null ? (
        <TabsNav
          items={subNav.map((item) => ({
            path: item.path,
            label: item.label,
            end: item.path === ZARZADZANIE_REPORTS_ENTRY,
          }))}
          className="no-scrollbar -mx-6 w-[calc(100%+3rem)] overflow-x-auto px-6"
          aria-label="Raporty"
        />
      ) : null}
      <Outlet />
    </div>
  );
}
