import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../../types/orderUiStatus";
import type { OrderStatusOption } from "../../../../types/wmsPackingSettings";
import { SettingsSubsection } from "../../../../pages/Settings/SettingsSubsection";
import { OrderStatusIdSelect } from "../components/OrderStatusIdSelect";
import type { DirectSalesSettingsConfig } from "../schemas/directSalesSettingsSchema";
import { FieldRow, selectClass, SettingsCard, ToggleRow } from "../components/settingsUi";

type Props = {
  config: DirectSalesSettingsConfig;
  statusOptions: OrderStatusOption[];
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
        hint="Pozwala prowadzić sprzedaż detaliczną bezpośrednio z magazynu."
        checked={config.enabled}
        onChange={(enabled) => onChange({ enabled })}
      />
      <FieldRow
        label="Status po zakończeniu sprzedaży"
        hint="Status nadawany automatycznie po zakończeniu sprzedaży."
      >
        <OrderStatusIdSelect
          value={config.default_order_status_id}
          panelSummary={panelSummary}
          panelSubgroups={panelSubgroups}
          onChange={(default_order_status_id) => onChange({ default_order_status_id })}
        />
      </FieldRow>
      <SettingsSubsection
        title="Statusy operacyjne workflow"
        description="Ten sam wybór statusów co w Pakowaniu i Akcjach automatycznych (NOWE / W TOKU / ZAKOŃCZONE)."
      >
        <div className="space-y-1">
          <FieldRow label="Status po utworzeniu sesji">
            <OrderStatusIdSelect
              value={config.session_created_order_status_id}
              panelSummary={panelSummary}
              panelSubgroups={panelSubgroups}
              emptyLabel="— brak —"
              onChange={(session_created_order_status_id) => onChange({ session_created_order_status_id })}
            />
          </FieldRow>
          <FieldRow label="Status po opłaceniu">
            <OrderStatusIdSelect
              value={config.paid_order_status_id}
              panelSummary={panelSummary}
              panelSubgroups={panelSubgroups}
              emptyLabel="— brak —"
              onChange={(paid_order_status_id) => onChange({ paid_order_status_id })}
            />
          </FieldRow>
          <FieldRow label="Status po wydaniu">
            <OrderStatusIdSelect
              value={config.issued_order_status_id}
              panelSummary={panelSummary}
              panelSubgroups={panelSubgroups}
              emptyLabel="— brak —"
              onChange={(issued_order_status_id) => onChange({ issued_order_status_id })}
            />
          </FieldRow>
          <FieldRow label="Status po anulowaniu">
            <OrderStatusIdSelect
              value={config.cancelled_order_status_id}
              panelSummary={panelSummary}
              panelSubgroups={panelSubgroups}
              emptyLabel="— brak —"
              onChange={(cancelled_order_status_id) => onChange({ cancelled_order_status_id })}
            />
          </FieldRow>
        </div>
      </SettingsSubsection>
      <FieldRow label="Typ dokumentu domyślny">
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
        label="Automatycznie rozpoczynaj nową sesję po zakończeniu sprzedaży"
        checked={config.auto_start_new_session}
        onChange={(auto_start_new_session) => onChange({ auto_start_new_session })}
      />
    </SettingsCard>
  );
}
