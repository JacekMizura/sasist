/** Recursively drop `undefined` so JSON matches backend expectations. */
export function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) return value;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = stripUndefinedDeep(v);
  }
  return out as T;
}

function finiteNum(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * When building footprint dimensions are set, align layout `width_m` / `length_m` with them
 * so the payload is not internally inconsistent (grid vs building).
 */
function alignLayoutDimensionsFromBuilding(payload: Record<string, unknown>): void {
  const bw = payload.building_width_m;
  const bd = payload.building_depth_m;
  if (bw != null) {
    const n = finiteNum(bw, NaN);
    if (Number.isFinite(n) && n > 0) payload.width_m = n;
  }
  if (bd != null) {
    const n = finiteNum(bd, NaN);
    if (Number.isFinite(n) && n > 0) payload.length_m = n;
  }
}

/**
 * Persist row slot references as rack UUID strings that exist in `payload.racks`.
 * Maps legacy `id` / `rack_index` (and matching uuid) to the canonical uuid; drops orphans.
 */
function normalizeRowContainerRackIdsToUuids(payload: Record<string, unknown>): void {
  const racks = payload.racks;
  const rowContainers = payload.row_containers;
  if (!Array.isArray(racks) || racks.length === 0 || !Array.isArray(rowContainers)) return;

  const resolveRef = (ref: unknown, slot: Record<string, unknown>): string | null => {
    if (ref == null) return null;
    const s = String(ref).trim();
    if (!s) return null;

    const rackPayloads = racks.filter((r): r is Record<string, unknown> => r != null && typeof r === "object");
    const byUuid = rackPayloads.find((r) => typeof r.uuid === "string" && r.uuid === s);
    if (byUuid && typeof byUuid.uuid === "string") return String(byUuid.uuid);

    const matches = rackPayloads.filter(
      (r) =>
        (r.id != null && String(r.id) === s) || (r.rack_index != null && String(r.rack_index) === s)
    );
    if (matches.length === 0) return null;
    if (matches.length === 1 && typeof matches[0].uuid === "string") return String(matches[0].uuid);

    const sx = Math.round(finiteNum(slot.x, NaN));
    const sy = Math.round(finiteNum(slot.y, NaN));
    const sw = Math.round(finiteNum(slot.w, NaN));
    const sh = Math.round(finiteNum(slot.h, NaN));
    if (Number.isFinite(sx) && Number.isFinite(sy)) {
      for (const r of matches) {
        const rx = Math.round(finiteNum(r.x, 0));
        const ry = Math.round(finiteNum(r.y, 0));
        const rw = Math.round(finiteNum(r.width, 1));
        const rh = Math.round(finiteNum(r.height, 1));
        if (sx === rx && sy === ry && sw === rw && sh === rh && typeof r.uuid === "string") {
          return String(r.uuid);
        }
      }
    }
    return typeof matches[0].uuid === "string" ? String(matches[0].uuid) : null;
  };

  for (const rc of rowContainers) {
    if (!rc || typeof rc !== "object") continue;
    const slots = (rc as { slots?: unknown[] }).slots;
    if (!Array.isArray(slots)) continue;
    for (const slot of slots) {
      if (!slot || typeof slot !== "object") continue;
      const sl = slot as Record<string, unknown>;
      if (sl.rackId == null) continue;
      const uuid = resolveRef(sl.rackId, sl);
      if (uuid) sl.rackId = uuid;
      else delete sl.rackId;
    }
  }
}

/** Coerce common numeric fields on racks/bins (API expects numbers, not NaN/undefined). */
function coerceLayoutNumerics(payload: Record<string, unknown>): void {
  payload.grid_cols = Math.round(finiteNum(payload.grid_cols, 24));
  payload.grid_rows = Math.round(finiteNum(payload.grid_rows, 16));
  payload.width_m = finiteNum(payload.width_m, (payload.grid_cols as number) / 10);
  payload.length_m = finiteNum(payload.length_m, (payload.grid_rows as number) / 10);

  const racks = payload.racks;
  if (!Array.isArray(racks)) return;
  for (const r of racks) {
    if (!r || typeof r !== "object") continue;
    const rack = r as Record<string, unknown>;
    rack.x = Math.round(finiteNum(rack.x, 0));
    rack.y = Math.round(finiteNum(rack.y, 0));
    rack.width = Math.round(finiteNum(rack.width, 1));
    rack.height = Math.round(finiteNum(rack.height, 1));
    rack.levels = Math.round(finiteNum(rack.levels, 1));
    rack.bins_per_level = Math.round(finiteNum(rack.bins_per_level, 1));
    rack.rack_index = Math.round(finiteNum(rack.rack_index, 1));
    rack.rack_type = rack.rack_type === "store" ? "store" : "warehouse";
    rack.length_cm = finiteNum(rack.length_cm, 80);
    rack.width_cm = finiteNum(rack.width_cm, 120);
    rack.height_cm = finiteNum(rack.height_cm, 200);
    const bins = rack.bins;
    if (!Array.isArray(bins)) continue;
    for (const b of bins) {
      if (!b || typeof b !== "object") continue;
      const bin = b as Record<string, unknown>;
      bin.level_index = Math.round(finiteNum(bin.level_index, 0));
      bin.segment_index = Math.round(finiteNum(bin.segment_index, 0));
      bin.volume_dm3 = finiteNum(bin.volume_dm3, 0);
      bin.current_load_dm3 = finiteNum(bin.current_load_dm3 ?? bin.used_volume_dm3, 0);
      delete bin.used_volume_dm3;
      if (bin.label == null) bin.label = "";
    }
  }

  const aisles = payload.aisles;
  if (Array.isArray(aisles)) {
    for (const a of aisles) {
      if (!a || typeof a !== "object") continue;
      const aisle = a as Record<string, unknown>;
      aisle.x = Math.round(finiteNum(aisle.x, 0));
      aisle.y = Math.round(finiteNum(aisle.y, 0));
      aisle.width = Math.round(finiteNum(aisle.width, 1));
      aisle.height = Math.round(finiteNum(aisle.height, 1));
    }
  }
}

export type LayoutSaveValidationResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; errors: string[] };

/**
 * Validate and sanitize layout payload before PUT /warehouse/:id/layout.
 */
export function validateAndSanitizeLayoutPayload(payload: Record<string, unknown>): LayoutSaveValidationResult {
  const errors: string[] = [];

  if (payload.layout_id !== undefined && payload.layout_id !== null) {
    const lid = payload.layout_id;
    if (typeof lid !== "number" || !Number.isFinite(lid)) {
      errors.push("layout_id must be a number when present");
    }
  }

  if (!Array.isArray(payload.racks)) {
    errors.push("racks must be an array");
  }
  if (!Array.isArray(payload.row_containers)) {
    errors.push("row_containers must be an array");
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  const cleaned = stripUndefinedDeep(payload) as Record<string, unknown>;
  alignLayoutDimensionsFromBuilding(cleaned);
  coerceLayoutNumerics(cleaned);
  normalizeRowContainerRackIdsToUuids(cleaned);

  if (!Array.isArray(cleaned.racks)) {
    return { ok: false, errors: ["racks must be an array after sanitize"] };
  }
  if (!Array.isArray(cleaned.row_containers)) {
    return { ok: false, errors: ["row_containers must be an array after sanitize"] };
  }

  const rackIntegrityErrors: string[] = [];
  const seenUuids = new Set<string>();
  const seenNames = new Set<string>();
  for (const r of cleaned.racks as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const uuid = typeof r.uuid === "string" ? r.uuid.trim() : "";
    if (!uuid) rackIntegrityErrors.push("regał bez uuid w payloadzie zapisu");
    else if (seenUuids.has(uuid)) rackIntegrityErrors.push(`zduplikowany uuid regału: ${uuid}`);
    else seenUuids.add(uuid);
    const name = typeof r.name === "string" ? r.name.trim().toLowerCase() : "";
    if (name) {
      if (seenNames.has(name)) rackIntegrityErrors.push(`zduplikowana nazwa regału: ${r.name}`);
      else seenNames.add(name);
    }
    if (r.rack_type !== "warehouse" && r.rack_type !== "store") {
      rackIntegrityErrors.push(`nieprawidłowy rack_type: ${String(r.rack_type)}`);
    }
  }
  if (rackIntegrityErrors.length) {
    return { ok: false, errors: rackIntegrityErrors };
  }

  return { ok: true, payload: cleaned };
}
