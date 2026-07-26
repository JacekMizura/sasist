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
  tabsAriaLabel?: string;
  /** Page body under tabs (split + canvas + rails). */
  children: ReactNode;
};

/**
 * Layout-only shell for warehouse modes (live / designer).
 * Wraps Layout 2.0 {@link PageLayout} + {@link SettingsModuleStack} — does not own feature logic.
 */
export function WarehouseShell({
  breadcrumbs,
  topActions,
  tabsSlot,
  tabsAriaLabel = "Widok magazynu",
  children,
}: WarehouseShellProps) {
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
        tabsSlot={tabsSlot}
      >
        {children}
      </SettingsModuleStack>
    </PageLayout>
  );
}
