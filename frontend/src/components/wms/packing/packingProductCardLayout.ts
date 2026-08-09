import type { CSSProperties } from "react";
import type { PackingProductDisplayMode } from "../../../types/wmsPackingExtendedUi";

/**
 * Wymiary i rozmieszczenie kart — proporcje jak Figma „Sidebar lista” / „Sidebar kafelki”.
 * Kontener: flex-wrap + justify-content:flex-start + stały gap (bez space-between / 1fr).
 */

/** Lista (pozioma): ~360px — 3 karty obok sidebara jak na mocku. */
export const PACKING_PRODUCT_LIST_CARD_WIDTH = "22.5rem";

/** Kafelki (pionowa): ~236px — zwarta kolumna jak na mocku. */
export const PACKING_PRODUCT_GRID_CARD_WIDTH = "14.75rem";

/** Kafelki: stała wysokość (Default / Active / Done jednakowe). */
export const PACKING_PRODUCT_GRID_CARD_HEIGHT = "23.5rem";

const GAP = "0.75rem";

export type PackingProductCardSizeOptions = {
  /**
   * Gdy false (np. podgląd ustawień), karta nie kurczy się poniżej stałej szerokości.
   * W rzeczywistym widoku pakowania (true) `maxWidth: 100%` pozwala zmieścić kartę w wąskim oknie.
   */
  allowShrink?: boolean;
};

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

export function packingProductCardItemClass(): string {
  return "box-border";
}

export function packingProductCardItemStyle(
  mode: PackingProductDisplayMode,
  options?: PackingProductCardSizeOptions,
): CSSProperties {
  const allowShrink = options?.allowShrink !== false;
  const maxWidth = allowShrink ? "100%" : undefined;

  if (mode === "grid") {
    return {
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: PACKING_PRODUCT_GRID_CARD_WIDTH,
      width: PACKING_PRODUCT_GRID_CARD_WIDTH,
      minWidth: PACKING_PRODUCT_GRID_CARD_WIDTH,
      ...(maxWidth ? { maxWidth } : {}),
      height: PACKING_PRODUCT_GRID_CARD_HEIGHT,
    };
  }
  return {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: PACKING_PRODUCT_LIST_CARD_WIDTH,
    width: PACKING_PRODUCT_LIST_CARD_WIDTH,
    minWidth: PACKING_PRODUCT_LIST_CARD_WIDTH,
    ...(maxWidth ? { maxWidth } : {}),
    height: "auto",
  };
}

export function packingProductCardSizeStyle(
  mode: PackingProductDisplayMode,
  options?: PackingProductCardSizeOptions,
): CSSProperties {
  const allowShrink = options?.allowShrink !== false;
  const maxWidth = allowShrink ? "100%" : undefined;

  if (mode === "grid") {
    return {
      width: PACKING_PRODUCT_GRID_CARD_WIDTH,
      minWidth: PACKING_PRODUCT_GRID_CARD_WIDTH,
      ...(maxWidth ? { maxWidth } : {}),
      height: PACKING_PRODUCT_GRID_CARD_HEIGHT,
      boxSizing: "border-box",
    };
  }
  return {
    width: PACKING_PRODUCT_LIST_CARD_WIDTH,
    minWidth: PACKING_PRODUCT_LIST_CARD_WIDTH,
    ...(maxWidth ? { maxWidth } : {}),
    height: "auto",
    boxSizing: "border-box",
  };
}

export function packingProductCardRootSizeClass(mode: PackingProductDisplayMode): string {
  return mode === "grid" ? "box-border overflow-hidden" : "box-border h-auto";
}
