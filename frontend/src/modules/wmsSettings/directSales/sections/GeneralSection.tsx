import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../../types/orderUiStatus";
import { OrderStatusIdSelect } from "../components/OrderStatusIdSelect";
import type { DirectSalesSettingsConfig } from "../schemas/directSalesSettingsSchema";
import { FieldRow, selectClass, SettingsCard, ToggleRow } from "../components/settingsUi";

type Props = {
  config: DirectSalesSettingsConfig;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  onChange: (patch: Partial<DirectSalesSettingsConfig>) => void;
};

export function GeneralSection({ config, panelSummary, panelSubgroups, onChange }: Props) {
  return (
    <SettingsCard
      id="ds-general"
      title="Ogólne"
      summary="Włączenie modułu i domyślne zachowanie sesji sprzedaży."
    >
      <ToggleRow
        label="Włącz sprzedaż bezpośrednią"
        hint="Przełącznik biznesowy dla tego zakresu (tenant / magazyn). Działa tylko gdy funkcja jest wdrożona."
        checked={config.enabled}
        onChange={(enabled) => onChange({ enabled })}
      />
      <FieldRow
        label="Status zamówienia sprzedaży"
        hint="Status nadawany zamówieniu utworzonemu podczas finalizacji sprzedaży."
      >
        <OrderStatusIdSelect
          value={config.default_order_status_id}
          panelSummary={panelSummary}
          panelSubgroups={panelSubgroups}
          onChange={(default_order_status_id) => onChange({ default_order_status_id })}
        />
      </FieldRow>
      <FieldRow
        label="Typ dokumentu domyślny"
        hint="Domyślny typ dla nowej sesji. Operator może zmienić go przed finalizacją sprzedaży."
      >
        <select
          className={selectClass}
          value={config.default_document_type}
          onChange={(e) =>
            onChange({ default_document_type: e.target.value as DirectSalesSettingsConfig["default_document_type"] })
          }
        >
          <option value="PA">Paragon (PA)</option>
          <option value="FV">Faktura VAT (FV)</option>
        </select>
      </FieldRow>
      <ToggleRow
        label="Automatycznie rozpocznij nową sesję po zamknięciu potwierdzenia sprzedaży"
        hint="Tworzy nową sesję w bazie po zamknięciu ekranu sukcesu — nie po błędzie płatności ani anulowaniu."
        checked={config.auto_start_new_session}
        onChange={(auto_start_new_session) => onChange({ auto_start_new_session })}
      />
    </SettingsCard>
  );
}
