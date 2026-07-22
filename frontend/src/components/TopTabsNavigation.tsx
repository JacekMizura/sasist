import type { ReactNode } from "react";

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
  /**
   * `card` — white shell (default WMS modules).
   * `bare` — underline tabs flush with page (Ustawienia → Użytkownicy screenshots).
   */
  chrome?: "card" | "bare";
  /** Optional trailing control aligned to the right of the tab row (e.g. primary CTA). */
  trailing?: ReactNode;
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
  chrome = "card",
  trailing,
}: TopTabsNavigationProps) {
  const nav = (
    <div className={trailing ? "flex items-end justify-between gap-4" : undefined}>
      <TabsNav
        items={tabs}
        tabLinkSearch={tabLinkSearch}
        exact={exact}
        aria-label={ariaLabel}
        className={trailing ? "min-w-0 flex-1" : undefined}
      />
      {trailing ? <div className="mb-0.5 shrink-0 pb-0.5">{trailing}</div> : null}
    </div>
  );

  if (chrome === "bare") {
    return <div className={className.trim() || undefined}>{nav}</div>;
  }

  return <TabsContainer className={className.trim() || undefined}>{nav}</TabsContainer>;
}
