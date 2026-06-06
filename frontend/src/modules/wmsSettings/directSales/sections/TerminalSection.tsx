import type { DirectSalesSettingsConfig } from "../schemas/directSalesSettingsSchema";
import { SettingsCard, ToggleRow } from "../components/settingsUi";

type Props = {
  config: DirectSalesSettingsConfig;
  onChange: (patch: Partial<DirectSalesSettingsConfig>) => void;
};

export function TerminalSection({ config, onChange }: Props) {
  return (
    <SettingsCard id="ds-terminal" title="Terminal / operacyjne" summary="Skróty, skaner i tryb urządzenia operatorskiego.">
      <ToggleRow label="Włącz skróty klawiaturowe" checked={config.keyboard_shortcuts} onChange={(keyboard_shortcuts) => onChange({ keyboard_shortcuts })} />
      <ToggleRow label="Włącz tryb skanera" checked={config.scanner_mode} onChange={(scanner_mode) => onChange({ scanner_mode })} />
      <ToggleRow label="Automatycznie focusuj pole skanowania" checked={config.auto_focus_scan} onChange={(auto_focus_scan) => onChange({ auto_focus_scan })} />
      <ToggleRow label="Dźwięki terminala" checked={config.terminal_sounds} onChange={(terminal_sounds) => onChange({ terminal_sounds })} />
      <ToggleRow label="Tryb Zebra / tablet" checked={config.zebra_tablet_mode} onChange={(zebra_tablet_mode) => onChange({ zebra_tablet_mode })} />
    </SettingsCard>
  );
}
