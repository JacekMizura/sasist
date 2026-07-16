import { Construction } from "lucide-react";

import { WmsSettingsLayout } from "./WmsSettingsLayout";
import { wmsSettingsTokens } from "./wmsSettingsTokens";

const COMING_SOON =
  "Moduł w przygotowaniu. Ustawienia pojawią się wraz z rozbudową funkcjonalności.";

export type WmsSettingsComingSoonProps = {
  /** Module tab label (for aria only — not shown as empty boxes). */
  label: string;
};

/**
 * Empty / future WMS settings tab — full width, no left section rail, no dashed boxes.
 */
export function WmsSettingsComingSoon({ label }: WmsSettingsComingSoonProps) {
  return (
    <WmsSettingsLayout sections={[]} asideLabel={undefined} observeSections={false}>
      <div
        className={`${wmsSettingsTokens.card} flex min-h-[280px] flex-col items-center justify-center gap-3 px-8 py-12 text-center`}
        role="status"
        aria-label={label}
      >
        <Construction className="h-8 w-8 text-slate-300" strokeWidth={1.5} aria-hidden />
        <p className="max-w-md text-sm leading-relaxed text-slate-600">{COMING_SOON}</p>
      </div>
    </WmsSettingsLayout>
  );
}
