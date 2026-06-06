import type { DirectSalesSettingsConfig } from "../schemas/directSalesSettingsSchema";
import { FieldRow, selectClass, SettingsCard, ToggleRow, WarningBlock } from "../components/settingsUi";

type Props = {
  config: DirectSalesSettingsConfig;
  onChange: (patch: Partial<DirectSalesSettingsConfig>) => void;
};

export function StockSection({ config, onChange }: Props) {
  return (
    <SettingsCard id="ds-stock" title="Stany magazynowe" summary="Alokacja towaru i widoczność lokacji w terminalu.">
      <ToggleRow
        label="Pozwalaj sprzedawać ponad stan magazynowy"
        hint="Pozwala zakończyć sprzedaż nawet przy braku dostępnego stanu."
        checked={config.allow_oversell}
        onChange={(allow_oversell) => onChange({ allow_oversell })}
      />
      {config.allow_oversell ? (
        <WarningBlock tone="amber">
          Włączona sprzedaż ponad stan — używaj tylko świadomie podczas rolloutu lub wyjątków operacyjnych.
        </WarningBlock>
      ) : null}
      <FieldRow label="Strategia alokacji">
        <select
          className={selectClass}
          value={config.allocation_strategy}
          onChange={(e) => onChange({ allocation_strategy: e.target.value as DirectSalesSettingsConfig["allocation_strategy"] })}
        >
          <option value="auto">Automatyczna</option>
          <option value="store_first">Preferuj lokalizacje sklepowe</option>
          <option value="pick_face">Preferuj pick-face</option>
          <option value="manual">Ręczny wybór operatora</option>
        </select>
      </FieldRow>
      <ToggleRow
        label="Ukrywaj lokalizacje bez stanu"
        checked={config.hide_empty_locations}
        onChange={(hide_empty_locations) => onChange({ hide_empty_locations })}
      />
    </SettingsCard>
  );
}
