import type { ModuleCardProps, ProductMultiModuleDef } from "../types";
import { PmaFieldRow } from "../PmaFieldRow";

export type GenerateEanConfig = {
  /** skip = leave products that already have EAN; overwrite = replace all */
  mode: "skip" | "overwrite";
};

function GenerateEanCard({ config, onChange, disabled }: ModuleCardProps<GenerateEanConfig>) {
  return (
    <div className="space-y-0.5">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        Gdy produkt ma już EAN
      </p>
      <PmaFieldRow
        label="Pomiń istniejące"
        radioName="pma-ean-mode"
        radioValue="skip"
        radioChecked={config.mode === "skip"}
        onRadioSelect={() => onChange({ mode: "skip" })}
        disabled={disabled}
      />
      <PmaFieldRow
        label="Nadpisz istniejące"
        radioName="pma-ean-mode"
        radioValue="overwrite"
        radioChecked={config.mode === "overwrite"}
        onRadioSelect={() => onChange({ mode: "overwrite" })}
        disabled={disabled}
      />
    </div>
  );
}

export const generateEanModule: ProductMultiModuleDef<GenerateEanConfig> = {
  id: "generate_ean",
  label: "Generowanie EAN",
  group: "Podstawowe",
  stage: 1,
  defaultConfig: () => ({ mode: "skip" }),
  validate: () => null,
  Card: GenerateEanCard,
  toOps: (cfg) => [{ action: "generate_fake_ean", value: { mode: cfg.mode } }],
};
