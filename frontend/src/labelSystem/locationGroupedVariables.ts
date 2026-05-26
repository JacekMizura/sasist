/**
 * Location template — CSV-style multi-slot (grouped) label: palette + preview helpers.
 */

import type { LabelVariable } from "../types/labelSystem";
import { PREVIEW_SAMPLES } from "../types/labelSystem";

/** Warehouse palette entries hidden when showing grouped-only variables. */
export const LOCATION_SINGLE_SLOT_VARIABLE_IDS = new Set([
  "loc_name",
  "loc_barcode",
  "floor",
  "bin",
  "zone",
]);

/** Human labels for grouped slot tokens (Polish). */
export const GROUPED_FLOOR_SLOT_TITLES: Record<string, string> = {
  floor_1: "Piętro 1",
  floor_2: "Piętro 2",
  floor_3: "Piętro 3",
};

/** Shared fields on a merged CSV / multi-slot location label. */
export const GROUPED_WAREHOUSE_COMMON_IDS = ["row", "rack_name"] as const;

/** Slot fields shown under „Elementy etykiety”. */
export const GROUPED_WAREHOUSE_ELEMENT_IDS = [
  "floor_1",
  "floor_2",
  "floor_3",
  "barcode_1",
  "barcode_2",
  "barcode_3",
  "loc_name_1",
  "loc_name_2",
  "loc_name_3",
] as const;

/** Left column for palette / inspector: ``Piętro 1 →`` … (token added separately). */
export function groupedElementSlotArrowLabel(variableId: string): string {
  const ft = GROUPED_FLOOR_SLOT_TITLES[variableId];
  if (ft) return `${ft} →`;
  const bc = /^barcode_([123])$/.exec(variableId);
  if (bc) return `Kod kreskowy ${bc[1]} →`;
  const ln = /^loc_name_([123])$/.exec(variableId);
  if (ln) return `Nazwa lok. ${ln[1]} →`;
  return "";
}

export function partitionGroupedWarehouseItems(items: LabelVariable[]): {
  common: LabelVariable[];
  elements: LabelVariable[];
  other: LabelVariable[];
} {
  const commonSet = new Set<string>(GROUPED_WAREHOUSE_COMMON_IDS);
  const elemSet = new Set<string>(GROUPED_WAREHOUSE_ELEMENT_IDS);
  const common: LabelVariable[] = [];
  const elements: LabelVariable[] = [];
  const other: LabelVariable[] = [];
  for (const v of items) {
    if (commonSet.has(v.id)) common.push(v);
    else if (elemSet.has(v.id)) elements.push(v);
    else other.push(v);
  }
  const orderBy = (order: readonly string[], list: LabelVariable[]) =>
    order.map((id) => list.find((x) => x.id === id)).filter((x): x is LabelVariable => x != null);
  return {
    common: orderBy(GROUPED_WAREHOUSE_COMMON_IDS, common),
    elements: orderBy(GROUPED_WAREHOUSE_ELEMENT_IDS, elements),
    other,
  };
}

/** Read-only lines for „Podgląd danych” (no `{` `}` in UI). */
export function formatGroupedLocationDataPreview(rec: Record<string, unknown>): {
  rackText: string;
  rowText: string;
  floorLines: string[];
} {
  const rackText = String(rec.rack_name ?? "").trim() || "—";
  const rowText = String(rec.row ?? "").trim() || "—";
  const floorLines: string[] = [];
  for (let n = 1; n <= 3; n += 1) {
    const raw = rec[`floor_${n}`];
    const s = raw != null ? String(raw).trim() : "";
    if (s) floorLines.push(s);
  }
  return { rackText, rowText, floorLines };
}

/** Preview record: merged row like backend `merge_records_by_*` (slot fields + dimmed singles). */
export function buildGroupedLocationPreviewRecord(): Record<string, unknown> {
  const base = PREVIEW_SAMPLES.location;
  return {
    ...base,
    floor: "",
    loc_name: "",
    loc_barcode: "",
    barcode_data: "",
    "{floor}": "",
    "{loc_name}": "",
    "{loc_barcode}": "",
  };
}

export function filterWarehouseVariablesForGroupedLocation(items: LabelVariable[]): LabelVariable[] {
  return items.filter((v) => !LOCATION_SINGLE_SLOT_VARIABLE_IDS.has(v.id));
}

