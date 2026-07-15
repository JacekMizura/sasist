import {
  PRESET_TYPES,
  type PresetType,
} from "../../../services/labelPresets";

export type ReadyFilterId = "all" | "locations" | "racks" | "pallets" | "custom";

export type ReadySectionId = "locations" | "racks" | "pallets" | "custom";

export const READY_FILTERS: Array<{ id: ReadyFilterId; label: string }> = [
  { id: "all", label: "Wszystkie" },
  { id: "locations", label: "Lokalizacje" },
  { id: "racks", label: "Regały" },
  { id: "pallets", label: "Palety" },
  { id: "custom", label: "Własne" },
];

export const READY_SECTIONS: Array<{
  id: ReadySectionId;
  title: string;
  description: string;
}> = [
  {
    id: "locations",
    title: "Lokalizacje",
    description: "Etykiety binów, pięter i oznaczeń rzędów — start pod typowy regał.",
  },
  {
    id: "racks",
    title: "Regały",
    description: "Paski segmentów i belki wielosekcyjne do druku taśmowego.",
  },
  {
    id: "pallets",
    title: "Palety i nośniki",
    description: "Oznaczenia palet i nośników w strefach wysokiego składowania.",
  },
  {
    id: "custom",
    title: "Własne",
    description: "Szablony zapisane w Twoim magazynie — możesz je edytować i usuwać.",
  },
];

export const PRESET_SECTION: Record<PresetType, ReadySectionId> = {
  LOCATION_BASIC: "locations",
  LOCATION_BARCODE_LARGE: "locations",
  FLOOR_LOCATION: "locations",
  AISLE_LABEL: "locations",
  RACK_SEGMENT_STRIP: "racks",
  RACK_BEAM_MULTISECTION: "racks",
  PALLET_LABEL: "pallets",
};

export function presetsForFilter(filter: ReadyFilterId): PresetType[] {
  if (filter === "custom") return [];
  if (filter === "all") return [...PRESET_TYPES];
  return PRESET_TYPES.filter((t) => PRESET_SECTION[t] === filter);
}

export function sectionsVisibleForFilter(filter: ReadyFilterId): ReadySectionId[] {
  if (filter === "all") return ["locations", "racks", "pallets", "custom"];
  if (filter === "custom") return ["custom"];
  return [filter];
}
