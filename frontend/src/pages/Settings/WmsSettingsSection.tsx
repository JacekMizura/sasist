import type { ReactNode } from "react";

import { WMS_SETTINGS_SECTION_ANCHOR_CLASS } from "./wmsSettingsSectionConstants";
import { useWmsSettingsSectionAnchor } from "./WmsSettingsSectionRegistryContext";
import { cnParts, wmsSettingsTokens } from "./wmsSettingsTokens";

export type WmsSettingsSectionProps = {
  id: string;
  title?: string;
  summary?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Anchored settings section (left-nav target). Full-width content block with shared chrome.
 */
export function WmsSettingsSection({ id, title, summary, children, className }: WmsSettingsSectionProps) {
  const anchorRef = useWmsSettingsSectionAnchor(id);
  const heading = (title ?? "").trim();
  return (
    <section
      ref={anchorRef}
      id={id}
      data-wms-section=""
      className={cnParts(WMS_SETTINGS_SECTION_ANCHOR_CLASS, className)}
      aria-label={heading ? `Sekcja: ${heading}` : undefined}
    >
      <div className={wmsSettingsTokens.card}>
        {heading ? (
          <div className="mb-4">
            <h2 className={wmsSettingsTokens.sectionTitle}>{heading}</h2>
            {summary ? <p className={wmsSettingsTokens.sectionSummary}>{summary}</p> : null}
          </div>
        ) : null}
        <div className={wmsSettingsTokens.fieldStack}>{children}</div>
      </div>
    </section>
  );
}

