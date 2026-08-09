import type { PackingProductDisplayMode } from "../../../types/wmsPackingExtendedUi";

/**
 * Wymiary kart produktów w widoku pakowania (Lista / Siatka).
 * Kontener układa kolejne karty (wrap) — bez rozciągania do szerokości ekranu.
 */

/** Lista: stała szerokość (~416px), lekki clamp na wąskich ekranach. */
export const PACKING_PRODUCT_LIST_CARD_WIDTH = "min(26rem, 100%)";

/** Siatka: stała szerokość (~248px). */
export const PACKING_PRODUCT_GRID_CARD_WIDTH = "min(15.5rem, 100%)";

/** Siatka: stała wysokość — jednakowa dla wszystkich kart (Default / Active / Done). */
export const PACKING_PRODUCT_GRID_CARD_HEIGHT = "28rem";

/** Kontener listy produktów — wrap, bez stretch do viewportu. */
export function packingProductCardsContainerClass(): string {
  return "m-0 flex w-full list-none flex-wrap content-start items-start gap-3 bg-white p-0";
}

/** Wrapper `<li>` — rozmiar z karty, bez flex-grow. */
export function packingProductCardItemClass(): string {
  return "h-auto w-auto shrink-0";
}

/** Style inline szerokości/wysokości karty (root element). */
export function packingProductCardSizeStyle(mode: PackingProductDisplayMode): {
  width: string;
  height?: string;
  maxWidth: string;
} {
  if (mode === "grid") {
    return {
      width: PACKING_PRODUCT_GRID_CARD_WIDTH,
      maxWidth: "100%",
      height: PACKING_PRODUCT_GRID_CARD_HEIGHT,
    };
  }
  return {
    width: PACKING_PRODUCT_LIST_CARD_WIDTH,
    maxWidth: "100%",
    height: "auto",
  };
}

/** Klasy root karty zależne od trybu (bez w-full/h-full rozciągających do komórki). */
export function packingProductCardRootSizeClass(mode: PackingProductDisplayMode): string {
  return mode === "grid" ? "box-border shrink-0 overflow-hidden" : "box-border h-auto shrink-0";
}
