import type { PackingLayoutMode, PackingProductDisplayMode } from "../../../../types/wmsPackingExtendedUi";
import type { PackingProductFieldVisibility } from "../packingProductDisplay";
import { PackingSettingsPreviewCollapse } from "./PackingSettingsPreviewCollapse";
import {
  PACKING_SETTINGS_PREVIEW_VISIBILITY,
  PackingSettingsPreviewFullWidthStrip,
  PackingSettingsPreviewOrderSidebar,
  PackingSettingsPreviewProductCards,
} from "./packingSettingsPreviewShared";

type Props = {
  mode: PackingLayoutMode;
  /** Aktualny wygląd produktów (Lista/Siatka) — żeby podgląd układu odzwierciedlał pakowanie. */
  productDisplayMode?: PackingProductDisplayMode;
  fieldVisibility?: PackingProductFieldVisibility;
};

/**
 * Podgląd „Wybierz układ”: rzeczywisty sidebar + prawdziwe karty produktów (bez szkieletów).
 */
export function PackingLayoutModePreview({
  mode,
  productDisplayMode = "grid",
  fieldVisibility = PACKING_SETTINGS_PREVIEW_VISIBILITY,
}: Props) {
  const label = mode === "full_width" ? "Pełna szerokość" : "Z sidebarem";
  /** W wąskim panelu ustawień kafelki skalujemy — wymiary kart zostają stałe. */
  const scale = productDisplayMode === "grid" ? 0.52 : 0.62;
  const scaleWidthPct = `${(100 / scale).toFixed(1)}%`;
  const cardLimit = productDisplayMode === "grid" ? 2 : 2;

  const products = (
    <div className="origin-top-left" style={{ transform: `scale(${scale})`, width: scaleWidthPct }}>
      <PackingSettingsPreviewProductCards
        mode={productDisplayMode}
        fieldVisibility={fieldVisibility}
        limit={cardLimit}
      />
    </div>
  );

  return (
    <PackingSettingsPreviewCollapse>
      <p className="mb-2 text-sm font-bold text-slate-900">{label}</p>
      <div className="overflow-hidden rounded-md border border-slate-100 bg-slate-50 p-2">
        {mode === "with_sidebar" ? (
          <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2">
            <PackingSettingsPreviewOrderSidebar />
            <div className="min-w-0 flex-1 overflow-hidden">{products}</div>
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 bg-white p-2">
            <PackingSettingsPreviewFullWidthStrip />
            <div className="overflow-hidden">{products}</div>
          </div>
        )}
      </div>
    </PackingSettingsPreviewCollapse>
  );
}
