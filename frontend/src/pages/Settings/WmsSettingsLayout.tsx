import type { ReactNode } from "react";

import WmsSettingsSectionNav from "./WmsSettingsSectionNav";
import { WmsSettingsSectionRegistryProvider } from "./WmsSettingsSectionRegistryContext";
import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";
import { cnParts, wmsSettingsTokens } from "./wmsSettingsTokens";

export type WmsSettingsLayoutProps = {
  sections: WmsSettingsSectionConfig[];
  asideLabel?: string;
  observeSections?: boolean;
  observeRevision?: unknown;
  children: ReactNode;
  footer?: ReactNode;
  mainClassName?: string;
};

/**
 * Shared WMS settings body: optional left section rail + content column.
 * Sidebar is hidden when there is at most one section (content uses full width).
 */
export function WmsSettingsLayout({
  sections,
  asideLabel,
  observeSections = true,
  observeRevision,
  children,
  footer,
  mainClassName = "",
}: WmsSettingsLayoutProps) {
  const showAside = sections.length > 1;
  const observe = observeSections && showAside;

  return (
    <WmsSettingsSectionRegistryProvider
      orderedSections={sections}
      observe={observe}
      observeRevision={observeRevision}
    >
      <div
        className={
          showAside
            ? "grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)] md:items-stretch"
            : "w-full min-w-0"
        }
      >
        {showAside ? (
          <aside className="relative min-h-0" aria-label={asideLabel ?? "Sekcje ustawień"}>
            <div className="sticky top-24">
              <WmsSettingsSectionNav />
            </div>
          </aside>
        ) : null}
        <main className={cnParts("min-w-0 w-full", wmsSettingsTokens.mainStack, mainClassName)}>
          {children}
        </main>
      </div>
      {footer}
    </WmsSettingsSectionRegistryProvider>
  );
}
