import type { ReactNode } from "react";

import TopTabsNavigation from "../TopTabsNavigation";
import type { TabItem } from "../TopTabsNavigation";
import { PageHeader } from "./PageHeader";
import type { PageHeaderBreadcrumb } from "./PageHeader";

export type SettingsModuleStackProps = {
  breadcrumbs?: PageHeaderBreadcrumb[];
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tabs: TabItem[];
  tabLinkSearch?: string;
  tabsExact?: boolean;
  tabsAriaLabel?: string;
  /** When true, skip H1 title row (screenshot chrome: breadcrumb → tabs). */
  hideTitle?: boolean;
  /** Tab row chrome: card shell vs bare underline (Użytkownicy module). */
  tabsChrome?: "card" | "bare";
  /** CTA on the right of the tab row (e.g. + Dodaj użytkownika). */
  tabsTrailing?: ReactNode;
  children: ReactNode;
  /** Extra classes on the outer wrapper. */
  className?: string;
};

/**
 * Standard order for settings / administration modules with top tabs:
 * breadcrumbs → title + description + primary actions → tab row → page body.
 */
export function SettingsModuleStack({
  breadcrumbs = [],
  title,
  description,
  actions,
  tabs,
  tabLinkSearch,
  tabsExact,
  tabsAriaLabel,
  hideTitle = false,
  tabsChrome = "card",
  tabsTrailing,
  children,
  className = "",
}: SettingsModuleStackProps) {
  const showTitleRow = !hideTitle && (title || actions);

  return (
    <div className={`min-w-0${className ? ` ${className}` : ""}`.trim()}>
      <PageHeader
        title={showTitleRow ? title : null}
        subtitle={description}
        actions={showTitleRow ? actions : undefined}
        breadcrumbs={breadcrumbs}
        className={showTitleRow ? "space-y-2" : "space-y-1"}
      />
      {tabs.length > 0 ? (
        <div className={hideTitle ? "mt-3" : "mt-3 border-t border-slate-100 pt-2"}>
          <TopTabsNavigation
            tabs={tabs}
            tabLinkSearch={tabLinkSearch}
            exact={tabsExact}
            aria-label={tabsAriaLabel}
            chrome={tabsChrome}
            trailing={tabsTrailing}
          />
        </div>
      ) : null}
      <div className="min-w-0 pt-4">{children}</div>
    </div>
  );
}
