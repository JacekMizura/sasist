import type { ModuleCardProps, ProductMultiModuleDef } from "../types";
import { PmaFieldRow } from "../PmaFieldRow";
import { pmaInp } from "../uiTokens";

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
    <div className="space-y-0.5">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Tryb</p>
      <PmaFieldRow
        label="Zastąp tagi"
        radioName="pma-tags-mode"
        radioValue="replace"
        radioChecked={config.mode === "replace"}
        onRadioSelect={() => onChange({ ...config, mode: "replace" })}
        disabled={disabled}
      />
      <PmaFieldRow
        label="Dodaj do istniejących"
        radioName="pma-tags-mode"
        radioValue="add"
        radioChecked={config.mode === "add"}
        onRadioSelect={() => onChange({ ...config, mode: "add" })}
        disabled={disabled}
      />
      <div className="pt-1.5">
        <label className="mb-1 block text-sm font-medium text-slate-800">Tagi</label>
        <p className="mb-1 text-xs text-slate-400">Oddzielone przecinkiem</p>
        <textarea
          className={`${pmaInp} min-h-[4rem]`}
          disabled={disabled}
          value={config.raw}
          onChange={(e) => onChange({ ...config, raw: e.target.value })}
          placeholder="np. nowość, promo, outlet"
        />
      </div>
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
