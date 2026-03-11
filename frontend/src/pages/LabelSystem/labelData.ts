import type { LabelRecord, FormattingRules, SelectionMode } from "../../types/labelSystem";

type LayoutRack = {
  aisle_letter?: string;
  rack_index?: number;
  bins?: {
    label?: string;
    barcode_data?: string;
    location_id?: string;
    level_index?: number;
    segment_index?: number;
    storage_type?: string;
    volume_dm3?: number;
  }[];
};

type Layout = {
  racks?: LayoutRack[];
  visual_elements?: { type?: string; zoneType?: string; name?: string }[];
};

/** Canonical location code without leading zeros, e.g. A1-1-3 */
function canonicalLocationCode(
  aisleLetter: string,
  rackIndex: number,
  levelIndex: number,
  segmentIndex: number
): string {
  return `${aisleLetter}${rackIndex}-${levelIndex + 1}-${segmentIndex + 1}`;
}

export function getRecordsFromLayout(
  layout: Layout,
  selectionMode: SelectionMode,
  selectedRackIds: string[],
  manualLocationIds: string[]
): LabelRecord[] {
  const records: LabelRecord[] = [];
  const seen = new Set<string>();
  const racks = layout?.racks ?? [];

  for (let ri = 0; ri < racks.length; ri++) {
    const r = racks[ri];
    const aisleLetter = (r.aisle_letter ?? "A").toString().trim().toUpperCase().slice(0, 1);
    const rackIndex = Number(r.rack_index ?? ri + 1);
    const rackId = `${aisleLetter}${rackIndex}`;

    if (selectionMode === "by_rack" && selectedRackIds.length > 0 && !selectedRackIds.includes(rackId))
      continue;

    const bins = r.bins ?? [];

    for (let bi = 0; bi < bins.length; bi++) {
      const b = bins[bi];
      const levelIndex = b.level_index ?? 0;
      const segmentIndex = b.segment_index ?? 0;
      const locationCode = canonicalLocationCode(aisleLetter, rackIndex, levelIndex, segmentIndex);
      if (seen.has(locationCode)) continue;
      seen.add(locationCode);

      const barcode_data = b.barcode_data ?? b.location_id ?? b.label ?? locationCode;

      if (selectionMode === "reserve_only" && b.storage_type !== "reserve") continue;
      if (selectionMode === "manual" && manualLocationIds.length > 0 && !manualLocationIds.includes(barcode_data) && !manualLocationIds.includes(locationCode)) continue;

      const zoneName = layout.visual_elements?.find((ve) => ve.type === "zone")?.name ?? "Magazyn";
      const levelNum = levelIndex + 1;
      const positionNum = segmentIndex + 1;

      records.push({
        location_name: locationCode,
        location_code: locationCode,
        location_barcode: barcode_data,
        rack: rackId,
        level: levelNum,
        position: positionNum,
        rack_id: rackId,
        zone_name: zoneName,
        volume_capacity: b.volume_dm3,
        barcode_data,
        storage_type: (b.storage_type === "reserve" ? "reserve" : "primary") as "primary" | "reserve",
        aisle_letter: aisleLetter,
        rack_index: rackIndex,
        isBottomLevel: levelIndex === 0,
        "{loc_name}": locationCode,
        "{loc_barcode}": barcode_data,
        "{rack_id}": rackId,
        "{level_num}": levelNum,
        "{bin_pos}": String(positionNum),
        "{zone_name}": zoneName,
        "{capacity_dm3}": b.volume_dm3 ?? "",
      });
    }
  }

  return records;
}

export function applyFormatting(record: LabelRecord, rules: FormattingRules): LabelRecord {
  let location_name = record.location_name ?? record.location_code ?? "";
  let rack_id = record.rack_id ?? record.rack ?? "";
  const parts = location_name.split("-");
  // Canonical format A1-1-3: parts[0]=rack (e.g. A1), parts[1]=level, parts[2]=position

  if (rules.zeroPadRackIndex && record.aisle_letter != null && record.rack_index != null) {
    rack_id = `${record.aisle_letter}${String(record.rack_index).padStart(2, "0")}`;
    if (parts.length >= 1) parts[0] = rack_id;
  }
  if (rules.zeroPadLevel && parts.length >= 2) {
    const levelNum = parseInt(parts[1], 10);
    if (!Number.isNaN(levelNum)) parts[1] = String(levelNum).padStart(2, "0");
  }
  if (rules.zeroPadSegment && parts.length >= 3) {
    const segNum = parseInt(parts[2], 10);
    if (!Number.isNaN(segNum)) parts[2] = String(segNum).padStart(2, "0");
  }
  location_name = parts.join("-");
  let barcode_data = record.barcode_data ?? record.location_barcode ?? location_name;
  if (rules.prefix) barcode_data = rules.prefix + barcode_data;
  if (rules.suffix) barcode_data = barcode_data + rules.suffix;

  return {
    ...record,
    location_name,
    rack_id,
    barcode_data,
    location_barcode: barcode_data,
    "{loc_name}": location_name,
    "{loc_barcode}": barcode_data,
    "{rack_id}": rack_id,
    "{level_num}": record.level,
    "{bin_pos}": parts.length >= 3 ? parts[2] : record["{bin_pos}"],
    "{zone_name}": record.zone_name,
    "{capacity_dm3}": record.volume_capacity,
  };
}
