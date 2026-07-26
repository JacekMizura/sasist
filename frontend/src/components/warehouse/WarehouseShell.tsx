import type { ReactNode } from "react";

import PageLayout from "../layout/PageLayout";
import { SettingsModuleStack } from "../layout/SettingsModuleStack";
import type { PageHeaderBreadcrumb } from "../layout/PageHeader";

export type WarehouseShellProps = {
  breadcrumbs: PageHeaderBreadcrumb[];
  /** Header row actions (warehouse select, save, status). */
  topActions?: ReactNode;
  /** Magazyn | Projektowanie (or other) tab row — controlled buttons. */
  tabsSlot: ReactNode;
  /** CTA on the right of the tab row (preferred via WarehouseModuleLayout). */
  tabsTrailing?: ReactNode;
  tabsAriaLabel?: string;
  /** Page body under tabs (split + canvas + rails). */
  children: ReactNode;
};

/**
 * Layout-only shell for warehouse modes (live / designer).
 * Prefer {@link WarehouseModuleLayout} for the full module chrome.
 * Wraps Layout 2.0 {@link PageLayout} + {@link SettingsModuleStack} — does not own feature logic.
 */
export function WarehouseShell({
  breadcrumbs,
  topActions,
  tabsSlot,
  tabsTrailing,
  tabsAriaLabel = "Widok magazynu",
  children,
}: WarehouseShellProps) {
  const tabRow =
    tabsTrailing != null ? (
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">{tabsSlot}</div>
        <div className="mb-0.5 shrink-0 pb-0.5">{tabsTrailing}</div>
      </div>
    ) : (
      tabsSlot
    );

  return (
    <PageLayout
      fullBleed
      fillHeight
      cardClassName="relative flex min-h-0 flex-1 flex-col overflow-hidden !space-y-0"
    >
      <SettingsModuleStack
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        contentClassName="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        hideTitle
        breadcrumbs={breadcrumbs}
        actions={topActions}
        tabsAriaLabel={tabsAriaLabel}
        tabsSlot={tabRow}
      >
        {children}
      </SettingsModuleStack>
    </PageLayout>
  );
}
