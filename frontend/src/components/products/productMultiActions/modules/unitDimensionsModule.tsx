import type { ModuleCardProps, ProductMultiModuleDef } from "../types";
import { parseDecimal } from "../patchFieldUtils";
import { pmaCheckRow, pmaInp, pmaLab } from "../uiTokens";

export type UnitDimensionsConfig = {
  length: string;
  width: string;
  height: string;
  overwrite: boolean;
};

function UnitDimensionsCard({ config, onChange, disabled }: ModuleCardProps<UnitDimensionsConfig>) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["length", "Długość (cm)"],
            ["width", "Szerokość (cm)"],
            ["height", "Wysokość (cm)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className={pmaLab}>
            {label}
            <input
              className={pmaInp}
              disabled={disabled}
              inputMode="decimal"
              value={config[key]}
              onChange={(e) => onChange({ ...config, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <label className={pmaCheckRow}>
        <input
          type="checkbox"
          className="mt-0.5 rounded border-slate-300"
          checked={config.overwrite}
          disabled={disabled}
          onChange={(e) => onChange({ ...config, overwrite: e.target.checked })}
        />
        <span>Nadpisz istniejące</span>
      </label>
    </div>
  );
}

export const unitDimensionsModule: ProductMultiModuleDef<UnitDimensionsConfig> = {
  id: "unit_dimensions",
  label: "Gabaryty",
  group: "Logistyka",
  stage: 1,
  defaultConfig: () => ({ length: "", width: "", height: "", overwrite: true }),
  validate: (cfg) => {
    const L = parseDecimal(cfg.length);
    const W = parseDecimal(cfg.width);
    const H = parseDecimal(cfg.height);
    if (L == null || W == null || H == null) return "Podaj długość, szerokość i wysokość.";
    if (L <= 0 || W <= 0 || H <= 0) return "Wymiary muszą być większe od zera.";
    return null;
  },
  Card: UnitDimensionsCard,
  toOps: (cfg) => [
    {
      action: "set_dimensions",
      value: {
        length_cm: parseDecimal(cfg.length),
        width_cm: parseDecimal(cfg.width),
        height_cm: parseDecimal(cfg.height),
      },
    },
  ],
};
