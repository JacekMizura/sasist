import type { ReactNode } from "react";

import TopTabsNavigation from "../TopTabsNavigation";
import type { TabItem } from "../TopTabsNavigation";
import { PageHeader } from "./PageHeader";
import type { PageHeaderBreadcrumb } from "./PageHeader";

export type SettingsModuleStackProps = {
  breadcrumbs?: PageHeaderBreadcrumb[];
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tabs: TabItem[];
  tabLinkSearch?: string;
  tabsExact?: boolean;
  tabsAriaLabel?: string;
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
  children,
  className = "",
}: SettingsModuleStackProps) {
  return (
    <div className={`min-w-0${className ? ` ${className}` : ""}`.trim()}>
      <PageHeader
        title={title}
        subtitle={description}
        actions={actions}
        breadcrumbs={breadcrumbs}
        className={title ? "space-y-2" : "space-y-1"}
      />
      {tabs.length > 0 ? (
      <div className="mt-3 border-t border-slate-100 pt-2">
        <TopTabsNavigation
          tabs={tabs}
          tabLinkSearch={tabLinkSearch}
          exact={tabsExact}
          aria-label={tabsAriaLabel}
        />
      </div>
      ) : null}
      <div className="min-w-0 pt-2">{children}</div>
    </div>
  );
}
