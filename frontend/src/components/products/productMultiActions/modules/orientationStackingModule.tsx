import { PatchFieldsEditor } from "../PatchFieldsEditor";
import { buildPatchSet, emptyPatchState, type PatchFieldDef, type PatchFieldState } from "../patchFieldUtils";
import type { ModuleCardProps, ProductMultiModuleDef } from "../types";

const FIELDS: PatchFieldDef[] = [
  { key: "orientation_type", label: "Orientacja â€” produkt", type: "orientation" },
  { key: "shape_type", label: "KsztaĹ‚t â€” produkt", type: "shape" },
  { key: "stack_behavior", label: "UkĹ‚adanie w stos â€” produkt", type: "stack_behavior" },
  { key: "stack_compressible", label: "Kompresja przy ukĹ‚adaniu â€” produkt", type: "boolean" },
  { key: "compressed_height_cm", label: "WysokoĹ›Ä‡ po kompresji (cm) â€” produkt", type: "number", min: 0 },
  { key: "max_stack_weight", label: "Maks. waga stosu (kg) â€” produkt", type: "number", min: 0 },
  { key: "carton_orientation_type", label: "Orientacja â€” karton", type: "orientation" },
  { key: "carton_shape_type", label: "KsztaĹ‚t â€” karton", type: "shape" },
  { key: "carton_stack_behavior", label: "UkĹ‚adanie w stos â€” karton", type: "stack_behavior" },
  { key: "carton_stack_compressible", label: "Kompresja â€” karton", type: "boolean" },
  { key: "carton_compressed_height_cm", label: "WysokoĹ›Ä‡ po kompresji (cm) â€” karton", type: "number", min: 0 },
  { key: "carton_max_stack_weight", label: "Maks. waga stosu (kg) â€” karton", type: "number", min: 0 },
];

export type OrientationStackingConfig = {
  fields: Record<string, PatchFieldState>;
};

function OrientationStackingCard({ config, onChange, disabled }: ModuleCardProps<OrientationStackingConfig>) {
  return (
    <PatchFieldsEditor
      fields={FIELDS}
      state={config.fields}
      disabled={disabled}
      onChange={(fields) => onChange({ fields })}
    />
  );
}

export const orientationStackingModule: ProductMultiModuleDef<OrientationStackingConfig> = {
  id: "orientation_stacking",
  label: "Orientacja / skĹ‚adowanie",
  group: "Magazyn",
  stage: 1,
  defaultConfig: () => ({ fields: emptyPatchState(FIELDS) }),
  validate: (cfg) => {
    const built = buildPatchSet(FIELDS, cfg.fields);
    return "error" in built ? built.error : null;
  },
  Card: OrientationStackingCard,
  toOps: (cfg) => {
    const built = buildPatchSet(FIELDS, cfg.fields);
    if ("error" in built) return [];
    return [{ action: "patch_logistics_fields", value: { set: built.set } }];
  },
};

