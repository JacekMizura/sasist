import { Outlet } from "react-router-dom";

import TopTabsNavigation from "../../components/TopTabsNavigation";
import { pageShellDividerClass } from "../../design-system/pageLayout";
import { WORKFORCE_TABS } from "./workforceTabs";

/**
 * Zakładki Czas pracy — Layout 2.0 bare tabs.
 * Shell zapewnia {@link AdministratorsLayout} / {@link AdministratorsModuleFrame}.
 */
export default function WorkforceLayout() {
  return (
    <div className="min-w-0">
      <div className={pageShellDividerClass}>
        <TopTabsNavigation
          tabs={WORKFORCE_TABS}
          exact
          chrome="bare"
          aria-label="Czas pracy — podsekcje"
        />
      </div>
      <div className="min-w-0 pt-4">
        <Outlet />
      </div>
    </div>
  );
}
