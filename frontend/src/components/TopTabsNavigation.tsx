import { TabsContainer } from "./layout/TabsContainer";
import { TabsNav, type TabsNavItem } from "./layout/TabsNav";

export type TabItem = TabsNavItem;

type TopTabsNavigationProps = {
  tabs: TabItem[];
  /** Np. ``?tenant_id=2`` — dopisywane do każdej ścieżki zakładki (zachowanie kontekstu podmiotu). */
  tabLinkSearch?: string;
  /** When true, each tab is active only when the route exactly matches (no prefix). Default false. */
  exact?: boolean;
  className?: string;
  /** Optional accessible name for the tablist (e.g. module name). */
  "aria-label"?: string;
};

/**
 * Reusable horizontal tab navigation for WMS modules.
 * Use under page title: PageHeader → TopTabsNavigation → PageContent.
 */
export default function TopTabsNavigation({
  tabs,
  tabLinkSearch,
  exact = false,
  className = "",
  "aria-label": ariaLabel,
}: TopTabsNavigationProps) {
  return (
    <TabsContainer className={className.trim() || undefined}>
      <TabsNav items={tabs} tabLinkSearch={tabLinkSearch} exact={exact} aria-label={ariaLabel} />
    </TabsContainer>
  );
}
