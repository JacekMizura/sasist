import type { PackingProductDisplayMode } from "../../../types/wmsPackingExtendedUi";
import {
  DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY,
  type PackingProductFieldVisibility,
} from "./packingProductDisplay";
import { PackingSettingsPreviewCollapse } from "./settingsPreviews/PackingSettingsPreviewCollapse";
import {
  PACKING_SETTINGS_PREVIEW_VISIBILITY,
  PackingSettingsPreviewProductCards,
} from "./settingsPreviews/packingSettingsPreviewShared";

type Props = {
  mode: PackingProductDisplayMode;
  fieldVisibility?: PackingProductFieldVisibility;
};

/**
 * Podgląd Lista / Siatka — te same karty co w pakowaniu, zwijany, stałe wymiary.
 */
export function ProductDisplayModePreview({
  mode,
  fieldVisibility = DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY,
}: Props) {
  const label = mode === "grid" ? "Siatka" : "Lista";
  const visibility: PackingProductFieldVisibility = {
    ...PACKING_SETTINGS_PREVIEW_VISIBILITY,
    ...fieldVisibility,
    show_product_name: true,
    show_image: fieldVisibility.show_image !== false,
    show_location: fieldVisibility.show_location !== false,
  };

  return (
    <PackingSettingsPreviewCollapse>
      <p className="mb-2 text-sm font-bold text-slate-900">{label}</p>
      <div className="overflow-x-auto overflow-y-hidden rounded-md border border-slate-100 bg-white p-2">
        <PackingSettingsPreviewProductCards mode={mode} fieldVisibility={visibility} />
      </div>
    </PackingSettingsPreviewCollapse>
  );
}
