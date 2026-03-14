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
      if (selectionMode === "manual" && !manualLocationIds.includes(barcode_data) && !manualLocationIds.includes(locationCode)) continue;

      const zoneName = layout.visual_elements?.find((ve) => ve.type === "zone")?.name ?? "Magazyn";
      const levelNum = levelIndex + 1;
      const positionNum = segmentIndex + 1;
      const binLabel = segmentIndex < 26 ? String.fromCharCode(65 + segmentIndex) : String(segmentIndex + 1);

      records.push({
        location_name: locationCode,
        location_code: locationCode,
        location_barcode: barcode_data,
        rack: rackId,
        rack_name: rackId,
        bin: binLabel,
        level: levelNum,
        position: positionNum,
        segment_index: segmentIndex,
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
        "{rack_name}": rackId,
        "{bin}": binLabel,
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
  const location_name_raw = record.location_name ?? record.location_code ?? "";
  const hasStructural =
    record.rack_name != null &&
    record.level != null &&
    record.position != null;

  let rack_id: string;
  let levelNum: number | undefined;
  let positionNum: number | undefined;
  let bin: string | number | undefined;
  let levelStr: string;
  let positionStr: string;
  let location_name: string;

  if (hasStructural) {
    rack_id = String(record.rack_name ?? record.rack_id ?? record.rack ?? "");
    levelNum = Number(record.level);
    positionNum = Number(record.position);
    bin = record.bin;
    if (rules.zeroPadRackIndex && record.aisle_letter != null && record.rack_index != null) {
      rack_id = `${record.aisle_letter}${String(record.rack_index).padStart(2, "0")}`;
    }
    levelStr = rules.zeroPadLevel ? String(levelNum).padStart(2, "0") : String(levelNum);
    positionStr = rules.zeroPadSegment ? String(positionNum).padStart(2, "0") : String(positionNum);
    location_name = [rack_id, levelStr, positionStr].filter(Boolean).join("-") || location_name_raw;
  } else {
    const parts = location_name_raw.split("-");
    const parsedRack = parts.length >= 1 ? parts[0] : "";
    const parsedLevel = parts.length >= 2 ? parseInt(parts[1], 10) : undefined;
    const parsedPosition = parts.length >= 3 ? parseInt(parts[2], 10) : undefined;
    const parsedBin = parts.length >= 2 ? parts[0] : undefined;

    rack_id = record.rack_name ?? record.rack_id ?? record.rack ?? parsedRack;
    levelNum = record.level != null ? Number(record.level) : parsedLevel;
    positionNum = record.position != null ? Number(record.position) : parsedPosition;
    bin = record.bin ?? parsedBin;

    if (rules.zeroPadRackIndex && record.aisle_letter != null && record.rack_index != null) {
      rack_id = `${record.aisle_letter}${String(record.rack_index).padStart(2, "0")}`;
    }
    levelStr =
      levelNum != null && !Number.isNaN(levelNum)
        ? (rules.zeroPadLevel ? String(levelNum).padStart(2, "0") : String(levelNum))
        : (parts.length >= 2 ? parts[1] : "");
    positionStr =
      positionNum != null && !Number.isNaN(positionNum)
        ? (rules.zeroPadSegment ? String(positionNum).padStart(2, "0") : String(positionNum))
        : (parts.length >= 3 ? parts[2] : "");
    location_name = [rack_id, levelStr, positionStr].filter(Boolean).join("-") || location_name_raw;
  }

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
    "{level_num}": record.level ?? levelNum,
    "{bin_pos}": positionStr || (record.position != null ? String(record.position) : record["{bin_pos}"]),
    "{bin}": bin ?? record["{bin}"],
    "{zone_name}": record.zone_name,
    "{capacity_dm3}": record.volume_capacity,
  };
}
