import { Zap } from "lucide-react";
import type { PackingAutomationButtonsPosition, PackingProductDisplayMode } from "../../../../types/wmsPackingExtendedUi";
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
  position: PackingAutomationButtonsPosition;
  productDisplayMode?: PackingProductDisplayMode;
  fieldVisibility?: PackingProductFieldVisibility;
};

/** Miniatura belki aktywatorów — ten sam układ przycisków co w PackingAutomationActivators. */
function PreviewActivatorsStrip({ slot }: { slot: "top" | "bottom" }) {
  const buttons = (
    <div className="flex flex-wrap items-center gap-2" aria-hidden>
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#4caf50] px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
        <Zap className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        Status: Spakowane
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#1565c0] px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
        <Zap className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        Wyślij powiadomienie
      </span>
    </div>
  );

  if (slot === "top") {
    return (
      <div className="shrink-0 border-b border-slate-200 bg-white px-2 py-2" data-packing-automation-slot="top">
        {buttons}
      </div>
    );
  }

  return (
    <div
      className="sticky bottom-0 z-10 shrink-0 border-t border-slate-200 bg-white px-2 py-2"
      data-packing-automation-slot="bottom"
    >
      {buttons}
    </div>
  );
}

/**
 * Podgląd położenia aktywatorów automatyzacji względem kart produktów.
 */
export function PackingAutomationButtonsPositionPreview({
  position,
  productDisplayMode = "list",
  fieldVisibility = DEFAULT_PACKING_PRODUCT_FIELD_VISIBILITY,
}: Props) {
  const onTop = position === "top";
  const label = onTop ? "Na górze" : "Na dole";
  const visibility: PackingProductFieldVisibility = {
    ...PACKING_SETTINGS_PREVIEW_VISIBILITY,
    ...fieldVisibility,
    show_product_name: true,
    show_image: fieldVisibility.show_image !== false,
  };

  return (
    <PackingSettingsPreviewCollapse>
      <p className="mb-2 text-sm font-bold text-slate-900">{label}</p>
      <div className="overflow-hidden rounded-md border border-slate-100 bg-white">
        <div className="flex max-h-[22rem] flex-col">
          {onTop ? <PreviewActivatorsStrip slot="top" /> : null}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <PackingSettingsPreviewProductCards
              mode={productDisplayMode}
              fieldVisibility={visibility}
              limit={2}
            />
          </div>
          {!onTop ? <PreviewActivatorsStrip slot="bottom" /> : null}
        </div>
      </div>
    </PackingSettingsPreviewCollapse>
  );
}
