/** Polish labels for built-in permission preset keys from ``ROLE_PERMISSION_PRESETS``. */

export const BUILTIN_PRESET_LABELS_PL: Record<string, string> = {
  super_admin: "Super administrator",
  admin: "Administrator",
  warehouse_manager: "Kierownik magazynu",
  picker: "Kompletujący",
  packer: "Pakujący",
  purchasing: "Zakupy",
  analyst: "Analityk",
  readonly: "Tylko odczyt",
  viewer: "Tylko podgląd",
};

export function builtinPresetLabel(key: string): string {
  return BUILTIN_PRESET_LABELS_PL[key] ?? key;
}
