import { Outlet } from "react-router-dom";
import TopTabsNavigation from "../TopTabsNavigation";
import type { TabItem } from "../TopTabsNavigation";
import PageLayout from "./PageLayout";

type WmsModuleLayoutProps = {
  tabs: TabItem[];
  /** Przekazywane do TopTabsNavigation (np. ``?tenant_id=1``). */
  tabLinkSearch?: string;
  /** When true, tab is active only when route exactly matches. Default true for nested module routes. */
  exact?: boolean;
  /** Treść ustawia poziomy gutter przez `PageContainer` (jak lista zamówień). */
  flushHorizontal?: boolean;
};

/**
 * Tab-first module shell: renders the tab row **above** the route outlet.
 * Use only when child routes do not render their own breadcrumbs/title above the tabs;
 * for settings-style pages prefer {@link SettingsModuleStack} in a layout route so order is:
 * breadcrumbs → title → tabs → content.
 */
export default function WmsModuleLayout({
  tabs,
  tabLinkSearch,
  exact = true,
  flushHorizontal = false,
}: WmsModuleLayoutProps) {
  const tabNav = (
    <TopTabsNavigation tabs={tabs} tabLinkSearch={tabLinkSearch} exact={exact} aria-label="Podsekcje modułu" />
  );

  return (
    <PageLayout fullBleed={flushHorizontal} cardClassName="relative min-h-[600px] w-full">
      {tabNav}
      <Outlet />
    </PageLayout>
  );
}
