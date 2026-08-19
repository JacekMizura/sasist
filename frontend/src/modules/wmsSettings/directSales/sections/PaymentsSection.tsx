import type { DirectSalesSettingsConfig } from "../schemas/directSalesSettingsSchema";
import { SettingsCard, ToggleRow } from "../components/settingsUi";

type Props = {
  config: DirectSalesSettingsConfig;
  onChange: (patch: Partial<DirectSalesSettingsConfig>) => void;
};

const METHODS = [
  { key: "cash" as const, label: "Gotówka" },
  { key: "card" as const, label: "Karta" },
  { key: "blik" as const, label: "BLIK" },
  { key: "transfer" as const, label: "Przelew" },
  { key: "mixed" as const, label: "Mieszana" },
];

export function PaymentsSection({ config, onChange }: Props) {
  const setMethod = (key: keyof DirectSalesSettingsConfig["payment_methods"], v: boolean) => {
    onChange({ payment_methods: { ...config.payment_methods, [key]: v } });
  };

  return (
    <SettingsCard id="ds-payments" title="Płatności" summary="Metody płatności i zachowanie kasy gotówkowej.">
      {METHODS.map((m) => (
        <ToggleRow
          key={m.key}
          label={m.label}
          checked={config.payment_methods[m.key]}
          onChange={(v) => setMethod(m.key, v)}
        />
      ))}
      <ToggleRow
        label="Wymagaj podania kwoty wpłaconej przy gotówce"
        checked={config.require_cash_received}
        onChange={(require_cash_received) => onChange({ require_cash_received })}
      />
      <ToggleRow
        label="Pokazuj wyliczoną resztę"
        checked={config.show_change_amount}
        onChange={(show_change_amount) => onChange({ show_change_amount })}
      />
      <ToggleRow
        label="Pozwalaj zakończyć sprzedaż bez pełnej płatności"
        checked={config.allow_incomplete_payment}
        onChange={(allow_incomplete_payment) => onChange({ allow_incomplete_payment })}
      />
      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Obsługa terminala</p>
        <ToggleRow
          label="Włącz skróty klawiaturowe"
          checked={config.keyboard_shortcuts}
          onChange={(keyboard_shortcuts) => onChange({ keyboard_shortcuts })}
        />
        <p className="mt-1 text-xs text-slate-500">
          F1 gotówka · F2 karta · F3 BLIK · Ctrl+Enter realizacja sprzedaży
        </p>
      </div>
    </SettingsCard>
  );
}
