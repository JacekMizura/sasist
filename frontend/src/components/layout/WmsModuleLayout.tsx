import { Outlet } from "react-router-dom";
import TopTabsNavigation from "../TopTabsNavigation";
import type { TabItem } from "../TopTabsNavigation";
import PageLayout from "./PageLayout";

type WmsModuleLayoutProps = {
  title: string;
  tabs: TabItem[];
  /** When true, tab is active only when route exactly matches. Default true for nested module routes. */
  exact?: boolean;
};

/**
 * Reusable WMS module layout: PageLayout (title + tabs) → ModuleContent (Outlet).
 * Use as wrapper for any module that has top tabs (Analytics, etc.).
 */
export default function WmsModuleLayout({ title, tabs, exact = true }: WmsModuleLayoutProps) {
  return (
    <PageLayout
      title={title}
      actions={<TopTabsNavigation tabs={tabs} exact={exact} className="mb-0" />}
    >
      <div className="min-h-[600px] w-full relative">
        <Outlet />
      </div>
    </PageLayout>
  );
}
