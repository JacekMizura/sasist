/**
 * Floor / terminal WMS operational modes.
 * Keys must match backend ``wms_operational_modes.WMS_OPERATIONAL_MODES``.
 *
 * System modules (Operacje, Wózki, …) live in Uprawnienia — see
 * ``LEGACY_WMS_MODULE_MODE_TO_PERMISSION`` for migration of old stored flags.
 */

export const WMS_OPERATIONAL_MODE_LABELS_PL: Record<string, string> = {
  receiving: "Przyjęcie",
  putaway: "Rozlokowanie PZ",
  picking: "Zbieranie",
  packing: "Pakowanie",
  issues: "Braki",
  inventory: "Inwentaryzacja",
  product_preview: "Podgląd produktu",
  returns: "Zwroty / Reklamacje",
  complaints: "Reklamacje",
  direct_sales: "Sprzedaż stacjonarna",
  production: "Produkcja",
  consolidations: "Kompletacja międzymagazynowa",
  mm: "Przesunięcia magazynowe",
};

export const WMS_OPERATIONAL_MODE_KEYS = Object.keys(WMS_OPERATIONAL_MODE_LABELS_PL);

/** Former mode chips → module permission keys (dual-read / load-time migration in admin UI). */
export const LEGACY_WMS_MODULE_MODE_TO_PERMISSION: Record<string, string> = {
  operations: "warehouse.operations",
  carts: "warehouse.carts",
  qc: "warehouse.qc",
  documents: "documents.view",
  analytics: "analytics.view",
  purchasing: "purchasing.view",
  labels: "workforce.ops.label_templates",
};

export function splitWmsModesAndLegacyPermissions(modes: string[] | null | undefined): {
  floorModes: string[];
  permissionKeys: string[];
} {
  const floorModes: string[] = [];
  const permissionKeys: string[] = [];
  const seenFloor = new Set<string>();
  const seenPerm = new Set<string>();
  const floorSet = new Set(WMS_OPERATIONAL_MODE_KEYS);
  for (const raw of modes ?? []) {
    const key = String(raw).trim();
    if (!key) continue;
    const mapped = LEGACY_WMS_MODULE_MODE_TO_PERMISSION[key];
    if (mapped) {
      if (!seenPerm.has(mapped)) {
        seenPerm.add(mapped);
        permissionKeys.push(mapped);
      }
      continue;
    }
    if (floorSet.has(key) && !seenFloor.has(key)) {
      seenFloor.add(key);
      floorModes.push(key);
    }
  }
  return { floorModes, permissionKeys };
}
