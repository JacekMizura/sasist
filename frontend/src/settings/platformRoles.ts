/** Canonical platform roles — must stay aligned with backend `SYSTEM_ROLE_VALUES`. */

export const PLATFORM_ROLE_OPTIONS = [
  { value: "super_admin", label: "Super administrator" },
  { value: "admin", label: "Administrator" },
  { value: "warehouse_manager", label: "Kierownik magazynu" },
  { value: "picker", label: "Kompletujący" },
  { value: "packer", label: "Pakujący" },
  { value: "purchasing", label: "Zakupy" },
  { value: "analyst", label: "Analityk" },
  { value: "readonly", label: "Tylko odczyt" },
  { value: "user", label: "Użytkownik (niestandardowy)" },
  // legacy DB values
  { value: "superadmin", label: "Superadmin (legacy)" },
] as const;
