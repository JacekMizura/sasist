import type { ReactNode } from "react";

import TopTabsNavigation from "../TopTabsNavigation";
import type { TabItem } from "../TopTabsNavigation";
import {
  pageModuleContentOffsetClass,
  pageModuleTabsOffsetClass,
} from "../../design-system/pageLayout";
import { PageHeader } from "./PageHeader";
import type { PageHeaderBreadcrumb } from "./PageHeader";

export type SettingsModuleStackProps = {
  breadcrumbs?: PageHeaderBreadcrumb[];
  title?: ReactNode;
  description?: ReactNode;
  /**
   * Header actions. With {@link hideTitle}, sit on the breadcrumb row
   * (e.g. warehouse select / toolbar in Projektant Magazynu).
   */
  actions?: ReactNode;
  /** Route-based tabs (Użytkownicy, Firma, …). Ignored when {@link tabsSlot} is set. */
  tabs?: TabItem[];
  /**
   * Custom tab row (controlled buttons, etc.). Uses the same breadcrumb→tabs→content
   * offsets as route tabs — do not wrap in extra mt/pt.
   */
  tabsSlot?: ReactNode;
  tabLinkSearch?: string;
  tabsExact?: boolean;
  tabsAriaLabel?: string;
  /** When true, skip H1 title row (screenshot chrome: breadcrumb → tabs). */
  hideTitle?: boolean;
  /** Tab row chrome: Layout 2.0 default is bare (inside PageContainer). */
  tabsChrome?: "card" | "bare";
  /** CTA on the right of the tab row (e.g. + Dodaj użytkownika). */
  tabsTrailing?: ReactNode;
  children: ReactNode;
  /** Extra classes on the outer wrapper. */
  className?: string;
  /** Extra classes on the content body (under tabs). Default: pageModuleContentOffsetClass. */
  contentClassName?: string;
};

/**
 * Standard order for settings / administration modules with top tabs:
 * breadcrumbs → title + description + primary actions → tab row → page body.
 * Must sit inside a single {@link PageContainer} — do not wrap this stack in extra cards.
 *
 * Vertical rhythm is SSOT via {@link pageModuleTabsOffsetClass} /
 * {@link pageModuleContentOffsetClass} — feature pages must not redefine these gaps.
 */
export function SettingsModuleStack({
  breadcrumbs = [],
  title,
  description,
  actions,
  tabs = [],
  tabsSlot,
  tabLinkSearch,
  tabsExact,
  tabsAriaLabel,
  hideTitle = false,
  tabsChrome = "bare",
  tabsTrailing,
  children,
  className = "",
  contentClassName = "",
}: SettingsModuleStackProps) {
  const showTitleRow = !hideTitle && (title || actions);
  const routeTabs =
    tabs.length > 0 ? (
      <TopTabsNavigation
        tabs={tabs}
        tabLinkSearch={tabLinkSearch}
        exact={tabsExact}
        aria-label={tabsAriaLabel}
        chrome={tabsChrome}
        trailing={tabsTrailing}
      />
    ) : null;

  const customTabs =
    tabsSlot != null
      ? tabsTrailing != null
        ? (
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0 flex-1">{tabsSlot}</div>
              <div className="mb-0.5 shrink-0 pb-0.5">{tabsTrailing}</div>
            </div>
          )
        : tabsSlot
      : null;

  const tabRow = customTabs ?? routeTabs;

  return (
    <div className={`min-w-0${className ? ` ${className}` : ""}`.trim()}>
      <PageHeader
        title={showTitleRow ? title : null}
        subtitle={description}
        actions={actions}
        breadcrumbs={breadcrumbs}
        className={`shrink-0 ${showTitleRow ? "space-y-2" : "space-y-1"}`}
      />
      {tabRow != null ? (
        <div
          className={`shrink-0 ${
            hideTitle
              ? pageModuleTabsOffsetClass
              : `${pageModuleTabsOffsetClass} border-t border-slate-100 pt-2`
          }`}
        >
          {tabRow}
        </div>
      ) : null}
      <div
        className={`min-w-0 ${pageModuleContentOffsetClass}${contentClassName ? ` ${contentClassName}` : ""}`.trim()}
      >
        {children}
      </div>
    </div>
  );
}
