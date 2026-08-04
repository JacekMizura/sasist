import { Outlet, useLocation } from "react-router-dom";
import { TabsNav } from "../../components/layout/TabsNav";
import { PLAN_ZMIAN_PATH } from "../../modules/analizy/analizyModuleNav";
import { getOptymalizacjaSubNav } from "../../modules/optymalizacja/optymalizacjaNav";

/**
 * Plan zmian — top underline tabs (SASIST), bez lewego menu.
 * Shell = AnalizyModuleLayout → PageLayout.
 */
export default function OptymalizacjaLayout() {
  const { pathname } = useLocation();
  const subNav = getOptymalizacjaSubNav(pathname);

  return (
    <div className="min-w-0 space-y-4">
      {subNav != null ? (
        <TabsNav
          items={subNav.map((item) => ({
            path: item.path,
            label: item.label,
            end: item.path === PLAN_ZMIAN_PATH,
          }))}
          className="no-scrollbar -mx-6 w-[calc(100%+3rem)] overflow-x-auto px-6"
          aria-label="Plan zmian"
        />
      ) : null}
      <Outlet />
    </div>
  );
}
