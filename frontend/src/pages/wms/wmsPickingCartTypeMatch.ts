/**
 * Shared helpers: physical Cart.type (bulk|multi) vs picking tile hint (BULK|BASKETS).
 */

export type WmsPickingTileCartType = "BULK" | "BASKETS";

/** Czy zeskanowany typ wózka (API: bulk|multi) pasuje do kafelka statusu. */
export function cartTypeMatchesPickingTile(
  tileType: WmsPickingTileCartType | null | undefined,
  physicalCartType: string | null | undefined,
): boolean {
  if (tileType == null) return true;
  const t = (physicalCartType || "").trim().toLowerCase();
  if (tileType === "BULK") return t === "bulk";
  if (tileType === "BASKETS") return t === "multi";
  return true;
}

export function physicalCartTypeToTile(
  physicalCartType: string | null | undefined,
): WmsPickingTileCartType | null {
  const t = (physicalCartType || "").trim().toLowerCase();
  if (t === "bulk") return "BULK";
  if (t === "multi") return "BASKETS";
  return null;
}
