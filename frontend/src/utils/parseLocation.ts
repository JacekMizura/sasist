/**
 * Parse warehouse location codes like "A1-C-6" into rack / floor (piętro) / row (rząd).
 * Convention: hyphen-separated segments; last segment = row, second-to-last = floor,
 * everything before = rack (supports multi-segment racks, e.g. "AA-BB-CC-99").
 */

export type ParsedLocation = { rack_name: string; floor: string; row: string };

export function parseLocation(loc: string): ParsedLocation | null {
  const s = (loc ?? "").trim();
  if (!s) return null;
  const parts = s.split("-").map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length < 3) return null;
  if (parts.length === 3) {
    return { rack_name: parts[0]!, floor: parts[1]!, row: parts[2]! };
  }
  return {
    rack_name: parts.slice(0, -2).join("-"),
    floor: parts[parts.length - 2]!,
    row: parts[parts.length - 1]!,
  };
}

/** Mutates `record` so templates can bind {floor}, {row}, {rack_name} from loc_name / location_code. */
export function injectParsedLocationFields(record: Record<string, unknown>): void {
  const loc =
    String(record.loc_name ?? "").trim() ||
    String(record.location_name ?? "").trim() ||
    String(record.location_code ?? "").trim();
  const parsed = parseLocation(loc);
  if (!parsed) return;
  record.floor = parsed.floor;
  record.row = parsed.row;
  record.rack_name = parsed.rack_name;
  record["{floor}"] = parsed.floor;
  record["{row}"] = parsed.row;
  record["{rack_name}"] = parsed.rack_name;
}
