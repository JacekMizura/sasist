import type { ReactNode } from "react";

import { cnParts, wmsSettingsTokens } from "./wmsSettingsTokens";

export type SettingsSubsectionProps = {
  title: string;
  /** Optional short blurb under the title — not per-option help. */
  description?: ReactNode;
  /** Shared settings help control next to the title (typically {@link SettingInfoButton}). */
  info?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/**
 * Light nested group inside a main WMS settings section (SEKCJA → ŚRÓDSEKCJA → wiersze).
 * Not a heavy card — soft background + thin border so groups read clearly without nesting chrome.
 */
export function SettingsSubsection({ title, description, info, children, className }: SettingsSubsectionProps) {
  const heading = title.trim();
  const hasBody = children != null && children !== false && children !== true && children !== "";
  return (
    <div className={cnParts(wmsSettingsTokens.subsection, className)} data-wms-subsection="">
      {heading ? (
        <div className={hasBody ? wmsSettingsTokens.subsectionHeader : undefined}>
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className={wmsSettingsTokens.subsectionTitle}>{heading}</h3>
            {info}
          </div>
          {description ? <div className={wmsSettingsTokens.subsectionDescription}>{description}</div> : null}
        </div>
      ) : null}
      {hasBody ? <div className={wmsSettingsTokens.subsectionBody}>{children}</div> : null}
    </div>
  );
}

/** @deprecated Prefer {@link SettingsSubsection}. */
export const WmsSettingCard = SettingsSubsection;
export type WmsSettingCardProps = SettingsSubsectionProps;
