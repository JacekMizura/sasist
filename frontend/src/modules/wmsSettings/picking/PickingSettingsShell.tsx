import type { ReactNode } from "react";

import { WmsSettingsSectionRegistryProvider } from "../../../pages/Settings/WmsSettingsSectionRegistryContext";
import { useWmsSettingsSectionRegistry } from "../../../pages/Settings/WmsSettingsSectionRegistryContext";
import { WMS_PICKING_SETTINGS_NAV_SECTIONS } from "./pickingSettingsNavSections";
import { PickingSettingsSectionNav } from "./PickingSettingsSectionNav";

type ShellProps = {
  observe?: boolean;
  observeRevision?: unknown;
  children: ReactNode;
};

function ShellInner({ children }: { children: ReactNode }) {
  const { activeSectionId, scrollToSection } = useWmsSettingsSectionRegistry();
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
      <aside className="relative min-h-0" aria-label="Sekcje ustawień zbierania">
        <div className="lg:sticky lg:top-4">
          <PickingSettingsSectionNav activeSectionId={activeSectionId} onSelect={scrollToSection} />
        </div>
      </aside>
      <main className="min-w-0 space-y-5">{children}</main>
    </div>
  );
}

/**
 * 2-column picking settings chrome: sticky section nav · content.
 * Scroll-spy via shared WmsSettingsSectionRegistryProvider (IntersectionObserver).
 */
export function PickingSettingsShell({ observe = true, observeRevision, children }: ShellProps) {
  return (
    <WmsSettingsSectionRegistryProvider
      orderedSections={WMS_PICKING_SETTINGS_NAV_SECTIONS}
      observe={observe}
      observeRevision={observeRevision}
    >
      <ShellInner>{children}</ShellInner>
    </WmsSettingsSectionRegistryProvider>
  );
}
