/** Field definitions for partial bulk patch modals (checkbox + value). */

export type BulkPatchFieldType =
  | "boolean"
  | "number"
  | "text"
  | "orientation"
  | "shape"
  | "stack_behavior";

export type BulkPatchFieldDef = {
  key: string;
  label: string;
  hint?: string;
  type: BulkPatchFieldType;
  min?: number;
  step?: number;
};

export type ProductBulkPatchPreset =
  | "patch_wms_requirements"
  | "patch_replenishment"
  | "patch_logistics_data"
  | "patch_orientation_stacking"
  | "clear_logistics_data"
  | "toggle_master_carton_pack";

export const ORIENTATION_OPTIONS = [
  { value: "any", label: "Dowolna" },
  { value: "upright", label: "Pionowo" },
  { value: "no_stack", label: "Bez stosowania" },
] as const;

export const SHAPE_OPTIONS = [
  { value: "box", label: "Prostopadłościan" },
  { value: "cylinder", label: "Walec" },
] as const;

export const STACK_BEHAVIOR_OPTIONS = [
  { value: "stackable", label: "Można układać w stos" },
  { value: "no_stack", label: "Nie układać w stos" },
] as const;

export const PATCH_PRESET_META: Record<
  ProductBulkPatchPreset,
  { title: string; description: string; action: "patch_logistics_fields" | "clear_logistics_data" | "toggle_master_carton_pack" }
> = {
  patch_wms_requirements: {
    title: "Ustaw wymagania WMS",
    description: "Zaznacz tylko pola, które chcesz zmienić u wszystkich wybranych produktów.",
    action: "patch_logistics_fields",
  },
  patch_replenishment: {
    title: "Ustaw uzupełnienia",
    description: "Progi pick-face (PICK) i zapasu (RESERVE). Min ≤ max.",
    action: "patch_logistics_fields",
  },
  patch_logistics_data: {
    title: "Ustaw dane logistyczne",
    description: "Wymiary i waga jednostki oraz opakowanie zbiorcze.",
    action: "patch_logistics_fields",
  },
  patch_orientation_stacking: {
    title: "Ustaw orientację / składowanie",
    description: "Produkt jednostkowy i opakowanie zbiorcze.",
    action: "patch_logistics_fields",
  },
  clear_logistics_data: {
    title: "Wyczyść dane logistyczne",
    description: "Usuwa wymiary, wagę, objętość i dane kartonu (EAN, wymiary, waga).",
    action: "clear_logistics_data",
  },
  toggle_master_carton_pack: {
    title: "Opakowanie zbiorcze — wymagania WMS",
    description: "Włącza lub wyłącza wszystkie flagi wymagań opakowania zbiorczego przy przyjęciu.",
    action: "toggle_master_carton_pack",
  },
};

export const PATCH_PRESET_FIELDS: Partial<Record<ProductBulkPatchPreset, BulkPatchFieldDef[]>> = {
  patch_wms_requirements: [
    { key: "require_dimensions", label: "Wymagaj wymiarów produktu", type: "boolean", hint: "Długość, szerokość, wysokość" },
    { key: "require_recv_weight", label: "Wymagaj wagi produktu", type: "boolean" },
    { key: "track_batch", label: "Wymagaj numeru partii", type: "boolean" },
    { key: "track_expiry", label: "Wymagaj daty ważności", type: "boolean" },
    { key: "track_serial", label: "Wymagaj numeru seryjnego", type: "boolean" },
    { key: "require_recv_master_carton", label: "Produkt posiada opakowanie zbiorcze", type: "boolean" },
    { key: "require_recv_master_carton_ean", label: "Wymagaj EAN opakowania zbiorczego", type: "boolean" },
    { key: "require_recv_master_carton_qty", label: "Wymagaj ilości w opakowaniu zbiorczym", type: "boolean" },
    { key: "require_recv_master_carton_dims", label: "Wymagaj wymiarów opakowania zbiorczego", type: "boolean" },
    { key: "require_recv_master_carton_weight", label: "Wymagaj wagi opakowania zbiorczego", type: "boolean" },
  ],
  patch_replenishment: [
    { key: "min_pick_quantity", label: "PICK — min. ilość", type: "number", min: 0, step: 1 },
    { key: "max_pick_quantity", label: "PICK — max. ilość", type: "number", min: 0, step: 1 },
    { key: "min_reserve_quantity", label: "ZAPAS — min. ilość", type: "number", min: 0, step: 1 },
    { key: "max_reserve_quantity", label: "ZAPAS — max. ilość", type: "number", min: 0, step: 1 },
  ],
  patch_logistics_data: [
    { key: "length", label: "Długość jednostki (cm)", type: "number", min: 0 },
    { key: "width", label: "Szerokość jednostki (cm)", type: "number", min: 0 },
    { key: "height", label: "Wysokość jednostki (cm)", type: "number", min: 0 },
    { key: "weight", label: "Waga jednostki (kg)", type: "number", min: 0 },
    { key: "bulk_ean", label: "EAN opakowania zbiorczego", type: "text" },
    { key: "units_per_carton", label: "Sztuk w kartonie", type: "number", min: 0, step: 1 },
    { key: "carton_length_cm", label: "Karton — długość (cm)", type: "number", min: 0 },
    { key: "carton_width_cm", label: "Karton — szerokość (cm)", type: "number", min: 0 },
    { key: "carton_height_cm", label: "Karton — wysokość (cm)", type: "number", min: 0 },
    { key: "carton_weight_kg", label: "Waga kartonu (kg)", type: "number", min: 0 },
  ],
  patch_orientation_stacking: [
    { key: "orientation_type", label: "Orientacja — produkt", type: "orientation" },
    { key: "shape_type", label: "Kształt — produkt", type: "shape" },
    { key: "stack_behavior", label: "Układanie w stos — produkt", type: "stack_behavior" },
    { key: "stack_compressible", label: "Kompresja przy układaniu — produkt", type: "boolean" },
    { key: "compressed_height_cm", label: "Wysokość po kompresji (cm) — produkt", type: "number", min: 0 },
    { key: "max_stack_weight", label: "Maks. waga stosu (kg) — produkt", type: "number", min: 0 },
    { key: "carton_orientation_type", label: "Orientacja — karton", type: "orientation" },
    { key: "carton_shape_type", label: "Kształt — karton", type: "shape" },
    { key: "carton_stack_behavior", label: "Układanie w stos — karton", type: "stack_behavior" },
    { key: "carton_stack_compressible", label: "Kompresja — karton", type: "boolean" },
    { key: "carton_compressed_height_cm", label: "Wysokość po kompresji (cm) — karton", type: "number", min: 0 },
    { key: "carton_max_stack_weight", label: "Maks. waga stosu (kg) — karton", type: "number", min: 0 },
  ],
};
