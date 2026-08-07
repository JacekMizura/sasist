import { Construction, Settings2 } from "lucide-react";

import { WmsSettingsTabFrame } from "./WmsSettingsTabFrame";
import { WmsSettingsSection } from "./WmsSettingsSection";
import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";
import { wmsSettingsTokens } from "./wmsSettingsTokens";

const COMING_SOON =
  "Moduł w przygotowaniu. Ustawienia pojawią się wraz z rozbudową funkcjonalności.";

const PLACEHOLDER_NAV: WmsSettingsSectionConfig[] = [
  { id: "wms-soon-general", label: "Ogólne", icon: Settings2, iconClassName: "bg-slate-100 text-slate-600" },
];

export type WmsSettingsComingSoonProps = {
  /** Module tab label. */
  label: string;
};

/**
 * Future WMS settings tab — same chrome as live modules (title, search, left nav).
 */
export function WmsSettingsComingSoon({ label }: WmsSettingsComingSoonProps) {
  return (
    <WmsSettingsTabFrame
      title={label}
      description="Konfiguracja procesu magazynowego — sekcje pojawią się w kolejnych iteracjach."
      sections={PLACEHOLDER_NAV}
      asideLabel={`Sekcje: ${label}`}
      observeSections={false}
    >
      <WmsSettingsSection
        id="wms-soon-general"
        title="Ogólne"
        summary="Placeholder sekcji — treść w przygotowaniu."
        icon={Settings2}
        iconClassName="bg-slate-100 text-slate-600"
      >
        <div
          className={`${wmsSettingsTokens.cardInner} flex min-h-[200px] flex-col items-center justify-center gap-3 px-6 py-10 text-center`}
          role="status"
          aria-label={label}
        >
          <Construction className="h-8 w-8 text-slate-300" strokeWidth={1.5} aria-hidden />
          <p className="max-w-md text-sm leading-relaxed text-slate-600">{COMING_SOON}</p>
        </div>
      </WmsSettingsSection>
    </WmsSettingsTabFrame>
  );
}
