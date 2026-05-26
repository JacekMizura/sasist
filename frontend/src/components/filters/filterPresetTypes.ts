/**
 * Optional future: saved filter presets (name + serialized filter payload per page).
 * Pages can adopt without changing storage format here.
 */
export type SavedFilterPresetPlaceholder = {
  id: string;
  name: string;
  /** Page-specific opaque payload — never sent unless page implements presets. */
  payloadJson: string;
};
