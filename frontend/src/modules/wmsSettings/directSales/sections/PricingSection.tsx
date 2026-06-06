import type { DirectSalesSettingsConfig } from "../schemas/directSalesSettingsSchema";
import { FieldRow, selectClass, SettingsCard, ToggleRow } from "../components/settingsUi";

type Props = {
  config: DirectSalesSettingsConfig;
  onChange: (patch: Partial<DirectSalesSettingsConfig>) => void;
};

export function PricingSection({ config, onChange }: Props) {
  return (
    <SettingsCard id="ds-pricing" title="Ceny i widok" summary="Prezentacja cen i informacji produktowych w terminalu.">
      <FieldRow label="Wyświetlanie cen">
        <select
          className={selectClass}
          value={config.price_display}
          onChange={(e) => onChange({ price_display: e.target.value as DirectSalesSettingsConfig["price_display"] })}
        >
          <option value="gross">Brutto</option>
          <option value="net">Netto</option>
          <option value="both">Netto + brutto</option>
        </select>
      </FieldRow>
      <ToggleRow label="Pokazuj marżę operatorowi" checked={config.show_margin} onChange={(show_margin) => onChange({ show_margin })} />
      <ToggleRow label="Pokazuj stan magazynowy operatorowi" checked={config.show_stock} onChange={(show_stock) => onChange({ show_stock })} />
      <ToggleRow label="Pokazuj zdjęcia produktów" checked={config.show_product_images} onChange={(show_product_images) => onChange({ show_product_images })} />
    </SettingsCard>
  );
}
