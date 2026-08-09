import type { CSSProperties } from "react";
import type { PackingProductDisplayMode } from "../../../types/wmsPackingExtendedUi";

/**
 * Wymiary i rozmieszczenie kart produktów (Lista / Siatka).
 *
 * Kontener: flex-wrap + justify-content:flex-start + stały gap.
 * Karty: stały flex-basis / width — bez grow, bez 1fr, bez space-between.
 */

/** Lista: stała szerokość (~416px). */
export const PACKING_PRODUCT_LIST_CARD_WIDTH = "26rem";

/** Siatka: stała szerokość (~248px). */
export const PACKING_PRODUCT_GRID_CARD_WIDTH = "15.5rem";

/** Siatka: stała wysokość — jednakowa dla wszystkich kart. */
export const PACKING_PRODUCT_GRID_CARD_HEIGHT = "28rem";

const GAP = "0.75rem";

/** Kontener — karty od lewej, stały odstęp, wrap do kolejnego wiersza. */
export function packingProductCardsContainerClass(): string {
  return "m-0 flex w-full list-none flex-wrap bg-white p-0";
}

export function packingProductCardsContainerStyle(): CSSProperties {
  return {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignContent: "flex-start",
    alignItems: "flex-start",
    columnGap: GAP,
    rowGap: GAP,
  };
}

/** Wrapper `<li>` — sztywny slot karty (bez rozciągania w wolną przestrzeń). */
export function packingProductCardItemClass(): string {
  return "box-border max-w-full";
}

export function packingProductCardItemStyle(mode: PackingProductDisplayMode): CSSProperties {
  if (mode === "grid") {
    return {
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: PACKING_PRODUCT_GRID_CARD_WIDTH,
      width: PACKING_PRODUCT_GRID_CARD_WIDTH,
      maxWidth: "100%",
      height: PACKING_PRODUCT_GRID_CARD_HEIGHT,
    };
  }
  return {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: PACKING_PRODUCT_LIST_CARD_WIDTH,
    width: PACKING_PRODUCT_LIST_CARD_WIDTH,
    maxWidth: "100%",
    height: "auto",
  };
}

/** Style root karty — te same wymiary co slot `<li>`. */
export function packingProductCardSizeStyle(mode: PackingProductDisplayMode): CSSProperties {
  if (mode === "grid") {
    return {
      width: PACKING_PRODUCT_GRID_CARD_WIDTH,
      maxWidth: "100%",
      height: PACKING_PRODUCT_GRID_CARD_HEIGHT,
      boxSizing: "border-box",
    };
  }
  return {
    width: PACKING_PRODUCT_LIST_CARD_WIDTH,
    maxWidth: "100%",
    height: "auto",
    boxSizing: "border-box",
  };
}

export function packingProductCardRootSizeClass(mode: PackingProductDisplayMode): string {
  return mode === "grid" ? "box-border overflow-hidden" : "box-border h-auto";
}
