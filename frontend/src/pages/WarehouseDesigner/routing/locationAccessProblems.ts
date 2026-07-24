/**
 * Operator-facing Location Access problem list (projection of resolver statuses).
 * No UUIDs / edge ids in labels — designer diagnostics only.
 */

import type { LocationAccessBinding } from "../../../api/warehouseRoutingApi";
import type { RackState } from "../../../types/warehouse";

export const PROBLEM_STATUSES = new Set([
  "BLOCKED",
  "UNREACHABLE",
  "NO_RACK",
  "OVERRIDE_BROKEN",
  "NO_GRAPH",
  "AMBIGUOUS",
  "REVIEW",
]);

export type AccessProblemItem = {
  locationId: number;
  locationName: string;
  rackName: string | null;
  rackUuid: string | null;
  status: string;
  reason: string;
};

export function operatorAccessReason(status: string | undefined | null): string {
  const s = String(status || "").toUpperCase();
  switch (s) {
    case "BLOCKED":
      return "Dojście zablokowane";
    case "UNREACHABLE":
      return "Brak drogi w zasięgu";
    case "NO_RACK":
      return "Bez przypisanego regału";
    case "OVERRIDE_BROKEN":
      return "Ręczny punkt dostępu jest nieaktualny";
    case "NO_GRAPH":
      return "Brak sieci tras";
    case "AMBIGUOUS":
    case "REVIEW":
      return "Dostęp niejednoznaczny — do sprawdzenia";
    default:
      return "Brak dostępu";
  }
}

/** Special warehouse Locations that represent routing points, not storage bins. */
const FUNCTIONAL_LOCATION_TYPES = new Set(["PICK_START", "PACKING", "DOCK"]);

export function isFunctionalRoutingLocation(loc: {
  location_type?: string | null;
  type?: string | null;
  name?: string | null;
}): boolean {
  const lt = String(loc.location_type || "").trim().toUpperCase();
  if (FUNCTIONAL_LOCATION_TYPES.has(lt)) return true;
  // Fallback when API omits location_type (legacy payloads)
  const n = String(loc.name || "").trim().toUpperCase();
  if (n === "START" || n === "DOCK-IN" || n === "DOCK" || n === "PACKING") return true;
  return false;
}

export function isProblemAccessStatus(status: string | undefined | null): boolean {
  const s = String(status || "").toUpperCase();
  if (s === "OK" || s === "RESOLVED" || s === "LEGACY_NODE") return false;
  return PROBLEM_STATUSES.has(s) || (s !== "" && s !== "RESOLVED");
}

export function buildAccessProblemItems(
  locationAccess: LocationAccessBinding[],
  locations: { id: number; name: string; location_type?: string | null; type?: string | null }[],
  racks: RackState[]
): AccessProblemItem[] {
  const locById = new Map(locations.map((l) => [l.id, l]));
  const rackByUuid = new Map(
    racks.map((r) => [String(r.uuid || ""), (r.name || r.aisle_letter || "").trim() || null])
  );
  const rackById = new Map(
    racks
      .filter((r) => r.id != null)
      .map((r) => [Number(r.id), (r.name || r.aisle_letter || "").trim() || null])
  );

  const items: AccessProblemItem[] = [];
  for (const a of locationAccess) {
    if (!isProblemAccessStatus(a.status)) continue;
    const loc = locById.get(a.location_id);
    if (loc && isFunctionalRoutingLocation(loc)) continue;
    const ru = a.rack_uuid ? String(a.rack_uuid) : null;
    let rackName: string | null = null;
    if (ru && rackByUuid.has(ru)) rackName = rackByUuid.get(ru) ?? null;
    else if (a.rack_id != null) rackName = rackById.get(Number(a.rack_id)) ?? null;

    items.push({
      locationId: a.location_id,
      locationName: loc?.name || `Lokalizacja #${a.location_id}`,
      rackName,
      rackUuid: ru,
      status: String(a.status || "").toUpperCase(),
      reason: operatorAccessReason(a.status),
    });
  }

  items.sort((a, b) => {
    const ra = a.rackName || "\uffff";
    const rb = b.rackName || "\uffff";
    if (ra !== rb) return ra.localeCompare(rb, "pl");
    return a.locationName.localeCompare(b.locationName, "pl");
  });
  return items;
}

export type AccessProblemGroup = {
  rackKey: string;
  rackLabel: string;
  items: AccessProblemItem[];
};

export function groupAccessProblemsByRack(items: AccessProblemItem[]): AccessProblemGroup[] {
  const map = new Map<string, AccessProblemGroup>();
  for (const it of items) {
    const rackKey = it.rackUuid || it.rackName || "__no_rack__";
    const rackLabel = it.rackName || "Bez regału";
    let g = map.get(rackKey);
    if (!g) {
      g = { rackKey, rackLabel, items: [] };
      map.set(rackKey, g);
    }
    g.items.push(it);
  }
  return [...map.values()];
}
