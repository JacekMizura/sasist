import type { DirectSalesSettingsConfig } from "../schemas/directSalesSettingsSchema";
import { SettingsCard, ToggleRow } from "../components/settingsUi";

type Props = {
  config: DirectSalesSettingsConfig;
  onChange: (patch: Partial<DirectSalesSettingsConfig>) => void;
};

export function CustomersSection({ config, onChange }: Props) {
  return (
    <SettingsCard id="ds-customers" title="Klienci" summary="Sprzedaż anonimowa, FV i szybkie zakładanie klientów.">
      <ToggleRow label="Pozwalaj na sprzedaż anonimową" checked={config.allow_anonymous} onChange={(allow_anonymous) => onChange({ allow_anonymous })} />
      <ToggleRow label="Wymagaj klienta dla FV" checked={config.require_customer_for_invoice} onChange={(require_customer_for_invoice) => onChange({ require_customer_for_invoice })} />
      <ToggleRow label="Automatycznie zapisuj nowych klientów" checked={config.auto_save_customers} onChange={(auto_save_customers) => onChange({ auto_save_customers })} />
      <ToggleRow label="Włącz szybkie tworzenie klienta" checked={config.quick_create_customer} onChange={(quick_create_customer) => onChange({ quick_create_customer })} />
    </SettingsCard>
  );
}
