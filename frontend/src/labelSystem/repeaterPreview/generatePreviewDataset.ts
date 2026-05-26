/**
 * Generate synthetic preview arrays for repeater datasets.
 * Used only in preview; does not affect layout engine or template schema.
 */

export const MAX_PREVIEW_ITEMS = 3;

type PreviewItem = Record<string, unknown>;

/** Hyphenated location codes (e.g. A1-C-6); layout engine injects {rack_name},{floor},{row}. */
function locationsPreview(): PreviewItem[] {
  const codes = ["A1-C-6", "A1-D-1", "A2-A-12"];
  return codes.map((loc_name) => ({
    location_code: loc_name,
    location_barcode: loc_name,
    barcode_data: loc_name,
    loc_name,
    location_name: loc_name,
    loc_barcode: loc_name,
    "{loc_name}": loc_name,
  }));
}

function levelsPreview(): PreviewItem[] {
  return [
    {
      level: 1,
      level_name: "Level 1",
      barcode_data: "L1",
      level_code: "L1",
      loc_name: "Level 1",
      location_name: "Level 1",
    },
    {
      level: 2,
      level_name: "Level 2",
      barcode_data: "L2",
      level_code: "L2",
      loc_name: "Level 2",
      location_name: "Level 2",
    },
    {
      level: 3,
      level_name: "Level 3",
      barcode_data: "L3",
      level_code: "L3",
      loc_name: "Level 3",
      location_name: "Level 3",
    },
  ];
}

function segmentsPreview(): PreviewItem[] {
  return [
    { segment: "S1", segment_name: "Segment 1", barcode_data: "S1", value: "Segment 1" },
    { segment: "S2", segment_name: "Segment 2", barcode_data: "S2", value: "Segment 2" },
    { segment: "S3", segment_name: "Segment 3", barcode_data: "S3", value: "Segment 3" },
  ];
}

/**
 * Generate up to MAX_PREVIEW_ITEMS synthetic items for a dataset name.
 * Supported: locations, levels, segments.
 * Unknown datasets get generic { value: "Item 1" }, etc.
 */
export function generatePreviewDataset(datasetName: string): unknown[] {
  const normalized = datasetName.trim().toLowerCase();
  let items: PreviewItem[];

  if (normalized === "locations") {
    items = locationsPreview();
  } else if (normalized === "levels") {
    items = levelsPreview();
  } else if (normalized === "segments") {
    items = segmentsPreview();
  } else {
    items = Array.from({ length: MAX_PREVIEW_ITEMS }, (_, i) => ({
      value: `Item ${i + 1}`,
    }));
  }

  // Ensure every entry is an independent object (no shared refs with root record).
  return items.slice(0, MAX_PREVIEW_ITEMS).map((item) => ({ ...item }));
}
