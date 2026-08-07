import type { ModuleCardProps, ProductMultiModuleDef } from "../types";
import { PmaFieldRow } from "../PmaFieldRow";
import { pmaInp } from "../uiTokens";

export const VAT_PRESET_OPTIONS: { token: string; label: string }[] = [
  { token: "23", label: "23%" },
  { token: "8", label: "8%" },
  { token: "5", label: "5%" },
  { token: "0", label: "0%" },
  { token: "zw", label: "zw." },
  { token: "np", label: "np." },
];

export type VatRateConfig = { token: string };

function VatRateCard({ config, onChange, disabled }: ModuleCardProps<VatRateConfig>) {
  return (
    <PmaFieldRow
      label="Stawka VAT"
      disabled={disabled}
      control={
        <select
          className={pmaInp}
          disabled={disabled}
          value={config.token}
          onChange={(e) => onChange({ token: e.target.value })}
        >
          <option value="">— wybierz —</option>
          {VAT_PRESET_OPTIONS.map((o) => (
            <option key={o.token} value={o.token}>
              {o.label}
            </option>
          ))}
        </select>
      }
    />
  );
}

export const vatRateModule: ProductMultiModuleDef<VatRateConfig> = {
  id: "vat_rate",
  label: "VAT",
  group: "Ceny",
  stage: 1,
  defaultConfig: () => ({ token: "" }),
  validate: (cfg) => (cfg.token ? null : "Wybierz stawkę VAT."),
  Card: VatRateCard,
  toOps: (cfg) => [{ action: "set_vat_rate", value: cfg.token }],
};
