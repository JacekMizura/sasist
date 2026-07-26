import type { ReactNode } from "react";

import { AppSplitView } from "../layout/app";
import { tabsNavItemClassName } from "../layout/TabsNav";
import { brandTabsNavRowClassName } from "../../design-system/brandUi";
import type { PageHeaderBreadcrumb } from "../layout/PageHeader";
import { WarehouseShell } from "./WarehouseShell";
import { WarehouseLeftRail } from "./WarehouseLeftRail";

/** Built-in mode ids; string allows future modes (analiza, symulacja, …). */
export type WarehouseModuleTabId = "magazyn" | "layout" | "routes" | (string & {});

export type WarehouseModuleTab = {
  id: WarehouseModuleTabId;
  label: string;
};

export type WarehouseModuleLayoutProps = {
  breadcrumbs: PageHeaderBreadcrumb[];
  /** Header row (warehouse select, save, status). */
  topActions?: ReactNode;
  tabs: WarehouseModuleTab[];
  activeTab: WarehouseModuleTabId;
  onTabChange: (id: WarehouseModuleTabId) => void;
  tabsAriaLabel?: string;
  /** Right side of the tab bar (e.g. Eksportuj). */
  tabsTrailing?: ReactNode;
  /** Content only — wrapped by {@link WarehouseLeftRail}. */
  leftRail: ReactNode;
  /** Canvas / mode body. */
  children: ReactNode;
  /** Optional contextual right rail (products, properties). */
  rightRail?: ReactNode;
  featuresDataAttr?: string;
};

/**
 * Sole owner of warehouse module page layout for all modes.
 * Modes supply tab id, left-rail content, canvas children, and optional actions only.
 */
export function WarehouseModuleLayout({
  breadcrumbs,
  topActions,
  tabs,
  activeTab,
  onTabChange,
  tabsAriaLabel = "Widok magazynu",
  tabsTrailing,
  leftRail,
  children,
  rightRail,
  featuresDataAttr,
}: WarehouseModuleLayoutProps) {
  const tabsSlot = (
    <div className={tabsTrailing ? "flex items-end justify-between gap-4" : undefined}>
      <nav
        className={`${brandTabsNavRowClassName} min-w-0 flex-1 flex-nowrap overflow-x-auto sm:justify-start [-webkit-overflow-scrolling:touch]`}
        aria-label={tabsAriaLabel}
        role="tablist"
        data-warehouse-features={featuresDataAttr}
      >
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`warehouse-module-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls="warehouse-module-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              className={tabsNavItemClassName(selected)}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
      {tabsTrailing ? <div className="mb-0.5 shrink-0 pb-0.5">{tabsTrailing}</div> : null}
    </div>
  );

  return (
    <WarehouseShell
      breadcrumbs={breadcrumbs}
      topActions={topActions}
      tabsAriaLabel={tabsAriaLabel}
      tabsSlot={tabsSlot}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AppSplitView className="min-h-0 flex-1" left={<WarehouseLeftRail>{leftRail}</WarehouseLeftRail>} right={rightRail}>
          <div
            id="warehouse-module-panel"
            role="tabpanel"
            aria-labelledby={`warehouse-module-tab-${activeTab}`}
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          >
            {children}
          </div>
        </AppSplitView>
      </div>
    </WarehouseShell>
  );
}
