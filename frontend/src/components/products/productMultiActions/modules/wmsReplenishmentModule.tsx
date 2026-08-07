import { PatchFieldsEditor } from "../PatchFieldsEditor";
import { buildPatchSet, emptyPatchState, type PatchFieldDef, type PatchFieldState } from "../patchFieldUtils";
import type { ModuleCardProps, ProductMultiModuleDef } from "../types";

const FIELDS: PatchFieldDef[] = [
  { key: "min_pick_quantity", label: "PICK â€” min. iloĹ›Ä‡", type: "number", min: 0, step: 1 },
  { key: "max_pick_quantity", label: "PICK â€” max. iloĹ›Ä‡", type: "number", min: 0, step: 1 },
  { key: "min_reserve_quantity", label: "ZAPAS â€” min. iloĹ›Ä‡", type: "number", min: 0, step: 1 },
  { key: "max_reserve_quantity", label: "ZAPAS â€” max. iloĹ›Ä‡", type: "number", min: 0, step: 1 },
];

export type WmsReplenishmentConfig = {
  fields: Record<string, PatchFieldState>;
};

function WmsReplenishmentCard({ config, onChange, disabled }: ModuleCardProps<WmsReplenishmentConfig>) {
  return (
    <PatchFieldsEditor
      fields={FIELDS}
      state={config.fields}
      disabled={disabled}
      onChange={(fields) => onChange({ fields })}
    />
  );
}

export const wmsReplenishmentModule: ProductMultiModuleDef<WmsReplenishmentConfig> = {
  id: "wms_replenishment",
  label: "UzupeĹ‚nienia WMS",
  group: "Magazyn",
  stage: 1,
  defaultConfig: () => ({ fields: emptyPatchState(FIELDS) }),
  validate: (cfg) => {
    const built = buildPatchSet(FIELDS, cfg.fields);
    return "error" in built ? built.error : null;
  },
  Card: WmsReplenishmentCard,
  toOps: (cfg) => {
    const built = buildPatchSet(FIELDS, cfg.fields);
    if ("error" in built) return [];
    return [{ action: "patch_logistics_fields", value: { set: built.set } }];
  },
};

