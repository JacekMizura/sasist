/**
 * Exclude location label rows by parsed floor (same rules as backend `apply_label_filters` in `location_label_filters`).
 */
import type { LabelRecord } from "../types/labelSystem";
import { parseLocation } from "./parseLocation";

function normFloorToken(s: string): string {
  return s.trim().toUpperCase();
}

/** Floors to match against exclude list (uses record.floor, else middle segment of hyphenated loc code). */
export function effectiveFloorFromRecord(rec: LabelRecord | Record<string, unknown>): string | null {
  const r = rec as Record<string, unknown>;
  const rawFloor = r.floor;
  if (rawFloor != null && String(rawFloor).trim() !== "") {
    return normFloorToken(String(rawFloor));
  }
  const loc =
    String(r.loc_name ?? "").trim() ||
    String(r.location_name ?? "").trim() ||
    String(r.location_code ?? "").trim();
  const parsed = parseLocation(loc);
  if (!parsed) return null;
  return normFloorToken(parsed.floor);
}

export function filterLabelRecordsByExcludeFloors<T extends LabelRecord>(
  records: T[],
  excludeFloors: string[] | undefined | null
): T[] {
  const ex = new Set(
    (excludeFloors ?? [])
      .map((x) => normFloorToken(String(x)))
      .filter((x) => x.length > 0)
  );
  if (ex.size === 0) return records.slice();
  return records.filter((rec) => {
    const f = effectiveFloorFromRecord(rec);
    if (f == null) return true;
    return !ex.has(f);
  });
}
