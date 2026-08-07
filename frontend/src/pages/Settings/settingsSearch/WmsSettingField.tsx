import type { ReactNode } from "react";

import { cnParts } from "../wmsSettingsTokens";
import { WMS_SETTING_DATA_ATTR } from "./navigateToSetting";

type Props = {
  settingId: string;
  /** When true, renders a <label>; otherwise a <div> (for checkbox rows). */
  asLabel?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Marks a setting control for global search navigation (`data-wms-setting-id`).
 */
export function WmsSettingField({ settingId, asLabel = true, className, children }: Props) {
  const attrs = { [WMS_SETTING_DATA_ATTR]: settingId } as Record<string, string>;
  const cls = cnParts("wms-setting-field rounded-lg transition-[box-shadow,outline-color] duration-300", className);
  if (asLabel) {
    return (
      <label {...attrs} className={cls}>
        {children}
      </label>
    );
  }
  return (
    <div {...attrs} className={cls}>
      {children}
    </div>
  );
}
