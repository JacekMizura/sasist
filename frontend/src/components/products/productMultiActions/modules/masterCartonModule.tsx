import { PatchFieldsEditor } from "../PatchFieldsEditor";
import { buildPatchSet, emptyPatchState, type PatchFieldDef, type PatchFieldState } from "../patchFieldUtils";
import type { ModuleCardProps, ProductMultiModuleDef } from "../types";

const FIELDS: PatchFieldDef[] = [
  { key: "bulk_ean", label: "EAN opakowania zbiorczego", type: "text" },
  { key: "units_per_carton", label: "Sztuk w kartonie", type: "number", min: 0, step: 1 },
  { key: "carton_length_cm", label: "Karton â€” dĹ‚ugoĹ›Ä‡ (cm)", type: "number", min: 0 },
  { key: "carton_width_cm", label: "Karton â€” szerokoĹ›Ä‡ (cm)", type: "number", min: 0 },
  { key: "carton_height_cm", label: "Karton â€” wysokoĹ›Ä‡ (cm)", type: "number", min: 0 },
  { key: "carton_weight_kg", label: "Waga kartonu (kg)", type: "number", min: 0 },
];

export type MasterCartonConfig = {
  fields: Record<string, PatchFieldState>;
};

function MasterCartonCard({ config, onChange, disabled }: ModuleCardProps<MasterCartonConfig>) {
  return (
    <PatchFieldsEditor
      fields={FIELDS}
      state={config.fields}
      disabled={disabled}
      onChange={(fields) => onChange({ fields })}
    />
  );
}

export const masterCartonModule: ProductMultiModuleDef<MasterCartonConfig> = {
  id: "master_carton",
  label: "Opakowanie zbiorcze",
  group: "Logistyka",
  stage: 1,
  defaultConfig: () => ({ fields: emptyPatchState(FIELDS) }),
  validate: (cfg) => {
    const built = buildPatchSet(FIELDS, cfg.fields);
    return "error" in built ? built.error : null;
  },
  Card: MasterCartonCard,
  toOps: (cfg) => {
    const built = buildPatchSet(FIELDS, cfg.fields);
    if ("error" in built) return [];
    return [{ action: "patch_logistics_fields", value: { set: built.set } }];
  },
};

