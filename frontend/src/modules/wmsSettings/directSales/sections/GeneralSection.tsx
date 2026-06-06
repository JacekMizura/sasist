import type { DirectSalesSettingsConfig } from "../schemas/directSalesSettingsSchema";
import { FieldRow, selectClass, SettingsCard, ToggleRow } from "../components/settingsUi";

type Props = {
  config: DirectSalesSettingsConfig;
  onChange: (patch: Partial<DirectSalesSettingsConfig>) => void;
};

export function GeneralSection({ config, onChange }: Props) {
  return (
    <SettingsCard
      id="ds-general"
      title="Ogólne"
      summary="Włączenie modułu i domyślne zachowanie sesji sprzedaży."
    >
      <ToggleRow
        label="Włącz sprzedaż bezpośrednią"
        hint="Pozwala prowadzić sprzedaż detaliczną bezpośrednio z magazynu."
        checked={config.enabled}
        onChange={(enabled) => onChange({ enabled })}
      />
      <FieldRow label="Domyślny status zamówienia">
        <select
          className={selectClass}
          value={config.default_order_status}
          onChange={(e) => onChange({ default_order_status: e.target.value as DirectSalesSettingsConfig["default_order_status"] })}
        >
          <option value="new">Nowe</option>
          <option value="paid">Opłacone</option>
          <option value="ready">Gotowe do wydania</option>
          <option value="completed">Zakończone</option>
        </select>
      </FieldRow>
      <FieldRow label="Typ dokumentu domyślny">
        <select
          className={selectClass}
          value={config.default_document_type}
          onChange={(e) => onChange({ default_document_type: e.target.value as DirectSalesSettingsConfig["default_document_type"] })}
        >
          <option value="PA">Paragon (PA)</option>
          <option value="FV">Faktura VAT (FV)</option>
        </select>
      </FieldRow>
      <ToggleRow
        label="Automatycznie rozpoczynaj nową sesję po zakończeniu sprzedaży"
        checked={config.auto_start_new_session}
        onChange={(auto_start_new_session) => onChange({ auto_start_new_session })}
      />
    </SettingsCard>
  );
}
