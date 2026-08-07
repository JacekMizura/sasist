import type { ModuleCardProps, ProductMultiModuleDef } from "../types";
import { parseDecimal } from "../patchFieldUtils";
import { pmaCheckRow, pmaInp, pmaLab } from "../uiTokens";

export type WeightConfig = {
  weightKg: string;
  overwrite: boolean;
};

function WeightCard({ config, onChange, disabled }: ModuleCardProps<WeightConfig>) {
  return (
    <div className="space-y-3">
      <label className={pmaLab}>
        Waga (kg)
        <input
          className={pmaInp}
          disabled={disabled}
          inputMode="decimal"
          value={config.weightKg}
          onChange={(e) => onChange({ ...config, weightKg: e.target.value })}
        />
      </label>
      <label className={pmaCheckRow}>
        <input
          type="checkbox"
          className="mt-0.5 rounded border-slate-300"
          checked={config.overwrite}
          disabled={disabled}
          onChange={(e) => onChange({ ...config, overwrite: e.target.checked })}
        />
        <span>Nadpisz istniejÄ…ce</span>
      </label>
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
    if (w == null) return "Podaj wagÄ™.";
    if (w < 0) return "Waga nie moĹĽe byÄ‡ ujemna.";
    return null;
  },
  Card: WeightCard,
  toOps: (cfg) => [{ action: "set_weight", value: parseDecimal(cfg.weightKg) }],
};

