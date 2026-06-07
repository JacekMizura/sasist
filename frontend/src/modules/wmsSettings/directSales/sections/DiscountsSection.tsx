import type { DirectSalesSettingsConfig } from "../schemas/directSalesSettingsSchema";
import { FieldRow, SettingsCard, ToggleRow } from "../components/settingsUi";

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
      <FieldRow label="Maksymalny rabat (%)" hint="Dotyczy rabatów procentowych na pozycji i zamówieniu.">
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          className="mt-1.5 w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
          className="mt-1.5 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={d.quick_discount_percents.join(", ")}
          onChange={(e) => {
            const parts = e.target.value
              .split(/[,;\s]+/)
              .map((x) => Number(x.trim()))
              .filter((n) => Number.isFinite(n) && n > 0 && n <= 100);
            onChange(patchDiscounts(config, { quick_discount_percents: parts.length ? parts : [5, 10, 15, 20] }));
          }}
        />
      </FieldRow>
      <ToggleRow
        label="Wymagaj zatwierdzenia kierownika (przyszłe)"
        hint="Flaga konfiguracyjna — egzekwowanie w kolejnej iteracji."
        checked={d.require_manager_approval}
        onChange={(require_manager_approval) => onChange(patchDiscounts(config, { require_manager_approval }))}
      />
      <ToggleRow
        label="Zezwalaj na sprzedaż poniżej marży (przyszłe)"
        hint="Flaga konfiguracyjna — egzekwowanie w kolejnej iteracji."
        checked={d.allow_negative_margin_override}
        onChange={(allow_negative_margin_override) =>
          onChange(patchDiscounts(config, { allow_negative_margin_override }))
        }
      />
    </SettingsCard>
  );
}
