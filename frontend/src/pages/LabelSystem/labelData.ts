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

export function getRecordsFromLayout(
  layout: Layout,
  selectionMode: SelectionMode,
  selectedRackIds: string[],
  manualLocationIds: string[]
): LabelRecord[] {
  const records: LabelRecord[] = [];
  const racks = layout?.racks ?? [];

  for (let ri = 0; ri < racks.length; ri++) {
    const r = racks[ri];
    const rackId = `${r.aisle_letter ?? "A"}${String(r.rack_index ?? ri + 1).padStart(2, "0")}`;

    if (selectionMode === "by_rack" && selectedRackIds.length > 0 && !selectedRackIds.includes(rackId))
      continue;

    const bins = r.bins ?? [];

    for (let bi = 0; bi < bins.length; bi++) {
      const b = bins[bi];
      const levelIndex = b.level_index ?? 0;
      const segmentIndex = b.segment_index ?? 0;
      const isBottomLevel = levelIndex === 0;
      const label = b.label ?? `${r.aisle_letter ?? "A"}-${String(r.rack_index ?? ri + 1).padStart(2, "0")}-${String(levelIndex + 1).padStart(2, "0")}-${String(segmentIndex + 1).padStart(2, "0")}`;
      const barcode_data = b.barcode_data ?? b.location_id ?? label;

      if (selectionMode === "reserve_only" && b.storage_type !== "reserve") continue;
      if (selectionMode === "manual" && manualLocationIds.length > 0 && !manualLocationIds.includes(barcode_data) && !manualLocationIds.includes(label)) continue;

      const zoneName = layout.visual_elements?.find((ve) => ve.type === "zone")?.name ?? "Magazyn";

      records.push({
        location_name: label,
        rack_id: rackId,
        level: levelIndex + 1,
        zone_name: zoneName,
        volume_capacity: b.volume_dm3,
        barcode_data,
        storage_type: (b.storage_type === "reserve" ? "reserve" : "primary") as "primary" | "reserve",
        aisle_letter: r.aisle_letter ?? "A",
        rack_index: r.rack_index ?? ri + 1,
        isBottomLevel,
        "{loc_name}": label,
        "{loc_barcode}": barcode_data,
        "{rack_id}": rackId,
        "{level_num}": levelIndex + 1,
        "{bin_pos}": String(segmentIndex + 1).padStart(2, "0"),
        "{zone_name}": zoneName,
        "{capacity_dm3}": b.volume_dm3 ?? "",
      });
    }
  }

  return records;
}

export function applyFormatting(record: LabelRecord, rules: FormattingRules): LabelRecord {
  let location_name = record.location_name;
  let rack_id = record.rack_id;
  const parts = location_name.split("-");

  if (rules.zeroPadRackIndex && record.aisle_letter != null && record.rack_index != null) {
    rack_id = `${record.aisle_letter}${String(record.rack_index).padStart(2, "0")}`;
  }
  if (rules.zeroPadLevel && parts.length >= 3) {
    const levelNum = parseInt(parts[2], 10);
    if (!Number.isNaN(levelNum)) parts[2] = String(levelNum).padStart(2, "0");
  }
  if (rules.zeroPadSegment && parts.length >= 4) {
    const segNum = parseInt(parts[3], 10);
    if (!Number.isNaN(segNum)) parts[3] = String(segNum).padStart(2, "0");
  }
  location_name = parts.join("-");
  let barcode_data = record.barcode_data ?? location_name;
  if (rules.prefix) barcode_data = rules.prefix + barcode_data;
  if (rules.suffix) barcode_data = barcode_data + rules.suffix;

  return {
    ...record,
    location_name,
    rack_id,
    barcode_data,
    "{loc_name}": location_name,
    "{loc_barcode}": barcode_data,
    "{rack_id}": rack_id,
    "{level_num}": record.level,
    "{bin_pos}": parts.length >= 4 ? parts[3] : record["{bin_pos}"],
    "{zone_name}": record.zone_name,
    "{capacity_dm3}": record.volume_capacity,
  };
}
