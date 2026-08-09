import type { PackingLocationBadgePosition, PackingProductDisplayMode } from "../../../../types/wmsPackingExtendedUi";
import {
  DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY,
  type PackingProductFieldVisibility,
} from "../packingProductDisplay";
import { PackingSettingsPreviewCollapse } from "./PackingSettingsPreviewCollapse";
import {
  PACKING_SETTINGS_PREVIEW_VISIBILITY,
  PackingSettingsPreviewProductCards,
} from "./packingSettingsPreviewShared";

type Props = {
  position: PackingLocationBadgePosition;
  productDisplayMode?: PackingProductDisplayMode;
  fieldVisibility?: PackingProductFieldVisibility;
};

/**
 * Podgląd umiejscowienia lokalizacji — te same karty co w pakowaniu.
 */
export function PackingLocationBadgePositionPreview({
  position,
  productDisplayMode = "list",
  fieldVisibility = DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY,
}: Props) {
  const label = position === "in_details" ? "W szczegółach produktu" : "Prawy górny róg";
  const visibility: PackingProductFieldVisibility = {
    ...PACKING_SETTINGS_PREVIEW_VISIBILITY,
    ...fieldVisibility,
    show_product_name: true,
    show_image: fieldVisibility.show_image !== false,
    show_location: true,
    location_placement: position,
    show_ean: true,
    show_symbol: true,
    show_catalog_number: true,
  };

  return (
    <PackingSettingsPreviewCollapse>
      <p className="mb-2 text-sm font-bold text-slate-900">{label}</p>
      <div className="overflow-x-auto overflow-y-hidden rounded-md border border-slate-100 bg-white p-2">
        <PackingSettingsPreviewProductCards
          mode={productDisplayMode}
          fieldVisibility={visibility}
          limit={2}
        />
      </div>
    </PackingSettingsPreviewCollapse>
  );
}
