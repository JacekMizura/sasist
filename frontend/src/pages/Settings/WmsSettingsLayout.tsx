import type { ReactNode } from "react";

import WmsSettingsSectionNav from "./WmsSettingsSectionNav";
import { WmsSettingsSectionRegistryProvider } from "./WmsSettingsSectionRegistryContext";
import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";

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
 * Sticky subsection rail + content. `md:items-stretch` makes the aside as tall as the content
 * column so `position: sticky` can act through the full scroll of the row (not a short `items-start` box).
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
  return (
    <WmsSettingsSectionRegistryProvider
      orderedSections={sections}
      observe={observeSections}
      observeRevision={observeRevision}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_minmax(0,1fr)] md:items-stretch">
        <aside className="relative min-h-0" aria-label={asideLabel}>
          <div className="sticky top-24">
            <WmsSettingsSectionNav />
          </div>
        </aside>
        <main className={["min-w-0", mainClassName].filter(Boolean).join(" ")}>{children}</main>
      </div>
      {footer}
    </WmsSettingsSectionRegistryProvider>
  );
}
