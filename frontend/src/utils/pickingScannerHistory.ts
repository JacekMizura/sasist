/**
 * Scanner Helper history kind before page handling completes.
 * On picking products path, location codes must not become "Ostatnia lokalizacja"
 * until the page accepts them (upgrade via appendScanToHistory kind=location).
 */
export function deferPickingLocationHistoryKind(
  classified: "location" | string,
  onPickingProductsPath: boolean,
): "location" | "other" | string {
  if (onPickingProductsPath && classified === "location") return "other";
  return classified;
}
