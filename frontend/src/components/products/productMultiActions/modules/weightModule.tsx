import type { ModuleCardProps, ProductMultiModuleDef } from "../types";
import { parseDecimal } from "../patchFieldUtils";
import { PmaFieldRow } from "../PmaFieldRow";
import { pmaInp } from "../uiTokens";

export type WeightConfig = {
  weightKg: string;
  overwrite: boolean;
};

function WeightCard({ config, onChange, disabled }: ModuleCardProps<WeightConfig>) {
  return (
    <div className="space-y-0.5">
      <PmaFieldRow
        label="Waga (kg)"
        disabled={disabled}
        control={
          <input
            className={pmaInp}
            disabled={disabled}
            inputMode="decimal"
            value={config.weightKg}
            onChange={(e) => onChange({ ...config, weightKg: e.target.value })}
          />
        }
      />
      <PmaFieldRow
        label="Nadpisz istniejące"
        checked={config.overwrite}
        onCheckedChange={(overwrite) => onChange({ ...config, overwrite })}
        disabled={disabled}
      />
    </div>
  );
}

export const weightModule: ProductMultiModuleDef<WeightConfig> = {
  id: "weight",
  label: "Waga",
  group: "Logistyka",
  stage: 1,
  defaultConfig: () => ({ weightKg: "", overwrite: true }),
  validate: (cfg) => {
    const w = parseDecimal(cfg.weightKg);
    if (w == null) return "Podaj wagę.";
    if (w < 0) return "Waga nie może być ujemna.";
    return null;
  },
  Card: WeightCard,
  toOps: (cfg) => [{ action: "set_weight", value: parseDecimal(cfg.weightKg) }],
};
