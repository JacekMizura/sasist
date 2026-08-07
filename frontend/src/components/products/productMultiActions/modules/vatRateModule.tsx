import type { ModuleCardProps, ProductMultiModuleDef } from "../types";
import { pmaLab, pmaInp } from "../uiTokens";

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
    <label className={pmaLab}>
      Stawka VAT
      <select
        className={pmaInp}
        disabled={disabled}
        value={config.token}
        onChange={(e) => onChange({ token: e.target.value })}
      >
        <option value="">â€” wybierz â€”</option>
        {VAT_PRESET_OPTIONS.map((o) => (
          <option key={o.token} value={o.token}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export const vatRateModule: ProductMultiModuleDef<VatRateConfig> = {
  id: "vat_rate",
  label: "Stawka VAT",
  group: "Ceny",
  stage: 1,
  defaultConfig: () => ({ token: "" }),
  validate: (cfg) => (cfg.token ? null : "Wybierz stawkÄ™ VAT."),
  Card: VatRateCard,
  toOps: (cfg) => [{ action: "set_vat_rate", value: cfg.token }],
};

