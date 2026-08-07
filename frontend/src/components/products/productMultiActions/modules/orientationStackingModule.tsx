import { PatchFieldsEditor } from "../PatchFieldsEditor";
import { buildPatchSet, emptyPatchState, type PatchFieldDef, type PatchFieldState } from "../patchFieldUtils";
import type { ModuleCardProps, ProductMultiModuleDef } from "../types";

const PRODUCT_FIELDS: PatchFieldDef[] = [
  { key: "orientation_type", label: "Orientacja", type: "orientation" },
  { key: "shape_type", label: "Kształt", type: "shape" },
  { key: "stack_behavior", label: "Składowanie", type: "stack_behavior" },
  { key: "stack_compressible", label: "Kompresja", type: "boolean" },
  { key: "compressed_height_cm", label: "Maks. wysokość po kompresji (cm)", type: "number", min: 0 },
  { key: "max_stack_weight", label: "Maks. waga stosu (kg)", type: "number", min: 0 },
];

const CARTON_FIELDS: PatchFieldDef[] = [
  { key: "carton_orientation_type", label: "Orientacja", type: "orientation" },
  { key: "carton_shape_type", label: "Kształt", type: "shape" },
  { key: "carton_stack_behavior", label: "Składowanie", type: "stack_behavior" },
  { key: "carton_stack_compressible", label: "Kompresja", type: "boolean" },
  { key: "carton_compressed_height_cm", label: "Maks. wysokość po kompresji (cm)", type: "number", min: 0 },
  { key: "carton_max_stack_weight", label: "Maks. waga stosu (kg)", type: "number", min: 0 },
];

const ALL_FIELDS = [...PRODUCT_FIELDS, ...CARTON_FIELDS];

export type OrientationStackingConfig = {
  fields: Record<string, PatchFieldState>;
};

function OrientationStackingCard({ config, onChange, disabled }: ModuleCardProps<OrientationStackingConfig>) {
  return (
    <div className="space-y-4">
      <PatchFieldsEditor
        sectionTitle="Produkt"
        fields={PRODUCT_FIELDS}
        state={config.fields}
        disabled={disabled}
        onChange={(fields) => onChange({ fields })}
      />
      <PatchFieldsEditor
        sectionTitle="Karton"
        fields={CARTON_FIELDS}
        state={config.fields}
        disabled={disabled}
        onChange={(fields) => onChange({ fields })}
      />
    </div>
  );
}

export const orientationStackingModule: ProductMultiModuleDef<OrientationStackingConfig> = {
  id: "orientation_stacking",
  label: "Parametry składowania",
  group: "Magazyn",
  stage: 1,
  defaultConfig: () => ({ fields: emptyPatchState(ALL_FIELDS) }),
  validate: (cfg) => {
    const built = buildPatchSet(ALL_FIELDS, cfg.fields);
    return "error" in built ? built.error : null;
  },
  Card: OrientationStackingCard,
  toOps: (cfg) => {
    const built = buildPatchSet(ALL_FIELDS, cfg.fields);
    if ("error" in built) return [];
    return [{ action: "patch_logistics_fields", value: { set: built.set } }];
  },
};
