import type { ReactNode } from "react";

import { WmsSettingsSectionRegistryProvider } from "../../../pages/Settings/WmsSettingsSectionRegistryContext";
import { useWmsSettingsSectionRegistry } from "../../../pages/Settings/WmsSettingsSectionRegistryContext";
import { WMS_PICKING_SETTINGS_NAV_SECTIONS } from "./pickingSettingsNavSections";
import { PickingSettingsSectionNav } from "./PickingSettingsSectionNav";

type ShellProps = {
  observe?: boolean;
  observeRevision?: unknown;
  preview: ReactNode;
  children: ReactNode;
};

function ShellInner({ preview, children }: { preview: ReactNode; children: ReactNode }) {
  const { activeSectionId, scrollToSection } = useWmsSettingsSectionRegistry();
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[220px_minmax(0,1fr)_260px] xl:items-start">
      <aside className="relative min-h-0" aria-label="Sekcje ustawień zbierania">
        <div className="xl:sticky xl:top-24">
          <PickingSettingsSectionNav activeSectionId={activeSectionId} onSelect={scrollToSection} />
        </div>
      </aside>
      <main className="min-w-0 space-y-6">{children}</main>
      <aside className="relative min-h-0" aria-label="Podgląd konfiguracji">
        <div className="xl:sticky xl:top-24">{preview}</div>
      </aside>
    </div>
  );
}

/**
 * 3-column picking settings chrome: section nav · content · sticky preview.
 * Uses the same section registry / scrollspy as other WMS settings modules.
 */
export function PickingSettingsShell({ observe = true, observeRevision, preview, children }: ShellProps) {
  return (
    <WmsSettingsSectionRegistryProvider
      orderedSections={WMS_PICKING_SETTINGS_NAV_SECTIONS}
      observe={observe}
      observeRevision={observeRevision}
    >
      <ShellInner preview={preview}>{children}</ShellInner>
    </WmsSettingsSectionRegistryProvider>
  );
}
