import { PatchFieldsEditor } from "../PatchFieldsEditor";
import { buildPatchSet, emptyPatchState, type PatchFieldDef, type PatchFieldState } from "../patchFieldUtils";
import type { ModuleCardProps, ProductMultiModuleDef } from "../types";

const FIELDS: PatchFieldDef[] = [
  { key: "min_pick_quantity", label: "Minimalna ilość PICK", type: "number", min: 0, step: 1 },
  { key: "max_pick_quantity", label: "Maksymalna ilość PICK", type: "number", min: 0, step: 1 },
  { key: "min_reserve_quantity", label: "Minimalna ilość ZAPAS", type: "number", min: 0, step: 1 },
  { key: "max_reserve_quantity", label: "Maksymalna ilość ZAPAS", type: "number", min: 0, step: 1 },
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
  label: "Uzupełnienia WMS",
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
