import type { DirectSalesSettingsConfig } from "../schemas/directSalesSettingsSchema";
import { parseQuickDiscountPercentsInput } from "../../../directSales/settings/quickDiscountPercents";
import { FieldRow, inputClass, SettingsCard, ToggleRow } from "../components/settingsUi";

type Props = {
  config: DirectSalesSettingsConfig;
  onChange: (patch: Partial<DirectSalesSettingsConfig>) => void;
};

function patchDiscounts(
  config: DirectSalesSettingsConfig,
  patch: Partial<DirectSalesSettingsConfig["discounts"]>,
): Partial<DirectSalesSettingsConfig> {
  return { discounts: { ...config.discounts, ...patch } };
}

export function DiscountsSection({ config, onChange }: Props) {
  const d = config.discounts;

  return (
    <SettingsCard
      id="ds-discounts"
      title="Rabaty POS"
      summary="Rabaty pozycji i całego zamówienia w terminalu sprzedaży bezpośredniej."
    >
      <ToggleRow
        label="Zezwalaj na rabaty pozycji"
        checked={d.allow_line_discounts}
        onChange={(allow_line_discounts) => onChange(patchDiscounts(config, { allow_line_discounts }))}
      />
      <ToggleRow
        label="Zezwalaj na rabat całego zamówienia"
        checked={d.allow_order_discounts}
        onChange={(allow_order_discounts) => onChange(patchDiscounts(config, { allow_order_discounts }))}
      />
      <ToggleRow
        label="Pokaż szybkie przyciski rabatu"
        checked={d.show_discount_buttons}
        onChange={(show_discount_buttons) => onChange(patchDiscounts(config, { show_discount_buttons }))}
      />
      <FieldRow
        label="Maksymalny rabat (%)"
        hint="Maksymalny łączny rabat względem wartości przed rabatami (pozycja + zamówienie)."
      >
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          className={inputClass}
          value={d.max_discount_percent}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v)) return;
            onChange(patchDiscounts(config, { max_discount_percent: Math.min(100, Math.max(0, v)) }));
          }}
        />
      </FieldRow>
      <FieldRow
        label="Szybkie rabaty (%)"
        hint="Lista wartości dla przycisków skrótu, oddzielone przecinkami."
      >
        <input
          type="text"
          className={inputClass}
          value={d.quick_discount_percents.join(", ")}
          onChange={(e) => {
            onChange(
              patchDiscounts(config, {
                quick_discount_percents: parseQuickDiscountPercentsInput(e.target.value),
              }),
            );
          }}
        />
      </FieldRow>
    </SettingsCard>
  );
}
