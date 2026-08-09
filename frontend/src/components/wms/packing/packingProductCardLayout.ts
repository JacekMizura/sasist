import type { CSSProperties } from "react";
import type { PackingProductDisplayMode } from "../../../types/wmsPackingExtendedUi";

/**
 * Wymiary kart produktów pakowania (mockup Siatka / Lista).
 * Kontener: flex-wrap + justify-content:flex-start — stałe wymiary, mniej kart w rzędzie zamiast ściskania.
 */

/** Lista: pełna szerokość wiersza, stała wysokość (Default/Done); Active może rosnąć. */
export const PACKING_PRODUCT_LIST_CARD_HEIGHT = "9.25rem";

/** Kafelki: szersza stała karta — zawartość nie jest ściśnięta. */
export const PACKING_PRODUCT_GRID_CARD_WIDTH = "20rem";

/** Kafelki: stała wysokość (Default / Active / Done jednakowe). */
export const PACKING_PRODUCT_GRID_CARD_HEIGHT = "19.5rem";

/** Stały obszar zdjęcia w siatce (kwadrat). */
export const PACKING_PRODUCT_GRID_IMAGE_SIZE = 128;

/** Stały obszar zdjęcia na liście. */
export const PACKING_PRODUCT_LIST_IMAGE_SIZE = 84;

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

  if (mode === "grid") {
    return {
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: PACKING_PRODUCT_GRID_CARD_WIDTH,
      width: PACKING_PRODUCT_GRID_CARD_WIDTH,
      minWidth: PACKING_PRODUCT_GRID_CARD_WIDTH,
      ...(allowShrink ? { maxWidth: "100%" } : {}),
      height: PACKING_PRODUCT_GRID_CARD_HEIGHT,
    };
  }

  return {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "100%",
    width: "100%",
    minWidth: 0,
    minHeight: PACKING_PRODUCT_LIST_CARD_HEIGHT,
  };
}

export function packingProductCardSizeStyle(
  mode: PackingProductDisplayMode,
  options?: PackingProductCardSizeOptions,
): CSSProperties {
  const allowShrink = options?.allowShrink !== false;

  if (mode === "grid") {
    return {
      width: PACKING_PRODUCT_GRID_CARD_WIDTH,
      minWidth: PACKING_PRODUCT_GRID_CARD_WIDTH,
      ...(allowShrink ? { maxWidth: "100%" } : {}),
      height: PACKING_PRODUCT_GRID_CARD_HEIGHT,
      boxSizing: "border-box",
    };
  }

  return {
    width: "100%",
    minWidth: 0,
    height: PACKING_PRODUCT_LIST_CARD_HEIGHT,
    boxSizing: "border-box",
  };
}

export function packingProductCardRootSizeClass(mode: PackingProductDisplayMode): string {
  return mode === "grid" ? "box-border overflow-hidden" : "box-border overflow-hidden";
}
