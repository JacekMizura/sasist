import type { ReactNode } from "react";

import { cnParts, wmsSettingsTokens } from "./wmsSettingsTokens";

export type WmsSettingCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

/** Nested card inside a {@link WmsSettingsSection} — shared padding / borders. */
export function WmsSettingCard({ title, description, children, className }: WmsSettingCardProps) {
  return (
    <div className={cnParts(wmsSettingsTokens.cardInner, className)}>
      <div className="mb-3 border-b border-slate-100/80 pb-3">
        <h3 className={wmsSettingsTokens.cardTitle}>{title}</h3>
        {description ? <p className={wmsSettingsTokens.cardDescription}>{description}</p> : null}
      </div>
      <div className={wmsSettingsTokens.fieldStack}>{children}</div>
    </div>
  );
}
