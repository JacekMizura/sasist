import { Outlet } from "react-router-dom";

import TopTabsNavigation from "../../components/TopTabsNavigation";
import { WORKFORCE_TABS } from "./workforceTabs";

export default function WorkforceLayout() {
  return (
    <div className="min-w-0 space-y-3">
      <TopTabsNavigation tabs={WORKFORCE_TABS} exact aria-label="Czas pracy — podsekcje" />
      <Outlet />
    </div>
  );
}
