import type { ModuleCardProps, ProductMultiModuleDef } from "../types";
import { pmaInp, pmaLab } from "../uiTokens";

export type TagsConfig = {
  mode: "replace" | "add";
  raw: string;
};

function parseTags(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function TagsCard({ config, onChange, disabled }: ModuleCardProps<TagsConfig>) {
  return (
    <div className="space-y-2.5">
      <fieldset>
        <legend className="text-xs font-medium text-slate-600">Tryb</legend>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={config.mode === "replace"}
              disabled={disabled}
              onChange={() => onChange({ ...config, mode: "replace" })}
            />
            Zastąp tagi
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={config.mode === "add"}
              disabled={disabled}
              onChange={() => onChange({ ...config, mode: "add" })}
            />
            Dodaj do istniejących
          </label>
        </div>
      </fieldset>
      <label className={pmaLab}>
        Tagi (oddzielone przecinkiem)
        <textarea
          className={`${pmaInp} min-h-[4rem]`}
          disabled={disabled}
          value={config.raw}
          onChange={(e) => onChange({ ...config, raw: e.target.value })}
          placeholder="np. nowość, promo, outlet"
        />
      </label>
    </div>
  );
}

export const tagsModule: ProductMultiModuleDef<TagsConfig> = {
  id: "tags",
  label: "Tagi",
  group: "Asortyment",
  stage: 1,
  defaultConfig: () => ({ mode: "replace", raw: "" }),
  validate: (cfg) => {
    if (cfg.mode === "add" && parseTags(cfg.raw).length === 0) return "Podaj co najmniej jeden tag.";
    return null;
  },
  Card: TagsCard,
  toOps: (cfg) => [
    {
      action: "set_tags",
      value: { mode: cfg.mode, tags: parseTags(cfg.raw) },
    },
  ],
};
