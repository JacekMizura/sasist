import { PatchFieldsEditor } from "../PatchFieldsEditor";
import { buildPatchSet, emptyPatchState, type PatchFieldDef, type PatchFieldState } from "../patchFieldUtils";
import type { ModuleCardProps, ProductMultiModuleDef } from "../types";

const FIELDS: PatchFieldDef[] = [
  {
    key: "require_dimensions",
    label: "Wymagaj wymiarów produktu",
    type: "boolean",
    hint: "Długość, szerokość, wysokość",
  },
  { key: "require_recv_weight", label: "Wymagaj wagi produktu", type: "boolean" },
  { key: "track_batch", label: "Wymagaj numeru partii", type: "boolean" },
  { key: "track_expiry", label: "Wymagaj daty ważności", type: "boolean" },
  { key: "track_serial", label: "Wymagaj numeru seryjnego", type: "boolean" },
  { key: "require_recv_master_carton", label: "Produkt posiada opakowanie zbiorcze", type: "boolean" },
  { key: "require_recv_master_carton_ean", label: "Wymagaj EAN opakowania zbiorczego", type: "boolean" },
  { key: "require_recv_master_carton_qty", label: "Wymagaj ilości w opakowaniu zbiorczym", type: "boolean" },
  { key: "require_recv_master_carton_dims", label: "Wymagaj wymiarów opakowania zbiorczego", type: "boolean" },
  { key: "require_recv_master_carton_weight", label: "Wymagaj wagi opakowania zbiorczego", type: "boolean" },
];

export type WmsValidationConfig = {
  fields: Record<string, PatchFieldState>;
};

function WmsValidationCard({ config, onChange, disabled }: ModuleCardProps<WmsValidationConfig>) {
  return (
    <PatchFieldsEditor
      fields={FIELDS}
      state={config.fields}
      disabled={disabled}
      onChange={(fields) => onChange({ fields })}
    />
  );
}

export const wmsValidationModule: ProductMultiModuleDef<WmsValidationConfig> = {
  id: "wms_validation",
  label: "Walidacja WMS",
  group: "Magazyn",
  stage: 1,
  defaultConfig: () => ({ fields: emptyPatchState(FIELDS) }),
  validate: (cfg) => {
    const built = buildPatchSet(FIELDS, cfg.fields);
    return "error" in built ? built.error : null;
  },
  Card: WmsValidationCard,
  toOps: (cfg) => {
    const built = buildPatchSet(FIELDS, cfg.fields);
    if ("error" in built) return [];
    return [{ action: "patch_logistics_fields", value: { set: built.set } }];
  },
};
