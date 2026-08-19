import type { DirectSalesSettingsConfig } from "../schemas/directSalesSettingsSchema";
import { FieldRow, selectClass, SettingsCard, ToggleRow } from "../components/settingsUi";

type Props = {
  config: DirectSalesSettingsConfig;
  onChange: (patch: Partial<DirectSalesSettingsConfig>) => void;
};

export function StockSection({ config, onChange }: Props) {
  return (
    <SettingsCard id="ds-stock" title="Stany magazynowe" summary="Tryb wydania z lokalizacji i widoczność lokacji w terminalu.">
      <FieldRow label="Tryb wydania z lokalizacji">
        <select
          className={selectClass}
          value={config.allocation_strategy}
          onChange={(e) => onChange({ allocation_strategy: e.target.value as DirectSalesSettingsConfig["allocation_strategy"] })}
        >
          <option value="auto_split">Automatyczny podział między lokalizacje</option>
          <option value="single_location">Wydanie z jednej lokalizacji</option>
          <option value="manual">Ręczny wybór lokalizacji</option>
        </select>
      </FieldRow>
      <ToggleRow
        label="Preferuj lokalizacje sprzedażowe"
        hint="Przy automatycznym wyborze w pierwszej kolejności używane są lokalizacje strefy sprzedaży. Jeśli ich stan jest niewystarczający, system może użyć pozostałych dostępnych lokalizacji."
        checked={config.prefer_store_locations}
        onChange={(prefer_store_locations) => onChange({ prefer_store_locations })}
      />
      <ToggleRow
        label="Ukryj puste lokalizacje w wyborze"
        hint="Dotyczy tylko listy lokalizacji wyświetlanej operatorowi. Nie zmienia dostępności produktu ani zasad wydania magazynowego."
        checked={config.hide_empty_locations}
        onChange={(hide_empty_locations) => onChange({ hide_empty_locations })}
      />
    </SettingsCard>
  );
}
