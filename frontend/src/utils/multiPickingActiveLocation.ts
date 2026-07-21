/**
 * MULTI picking: active source-location lifecycle (SSOT for FE).
 *
 * Never auto-pick locations[0]. Preserve last confirmed location across detail
 * refetch only when it still belongs to this product and has effective stock.
 */

export type ActiveLocationCandidate = {
  location_id: number;
  stock_quantity?: number | null;
};

export function locationEffectiveStock(loc: ActiveLocationCandidate | null | undefined): number {
  const q = loc?.stock_quantity;
  return typeof q === "number" && Number.isFinite(q) ? q : 0;
}

/**
 * Compute next activeLocationId after product detail loads / refreshes.
 *
 * - Server source_lock (if still valid) wins — refetch must not wipe provenance UI
 * - Single location → that id (no scan needed)
 * - Multi: keep previous only if still present and effective stock > 0
 * - Product change → clear (caller passes previousProductId mismatch)
 * - Never invent FIFO / first location fallback
 */
export function nextActiveLocationIdAfterDetail(args: {
  previousId: number | null;
  locations: ActiveLocationCandidate[];
  productChanged: boolean;
  serverSourceLocationId?: number | null;
}): number | null {
  const { previousId, locations, productChanged, serverSourceLocationId } = args;
  if (!locations.length) return null;
  if (productChanged) return null;

  const serverId =
    serverSourceLocationId != null && Number.isFinite(Number(serverSourceLocationId))
      ? Math.floor(Number(serverSourceLocationId))
      : null;
  if (serverId != null && serverId > 0) {
    const locked = locations.find((l) => l.location_id === serverId);
    if (locked && locationEffectiveStock(locked) > 1e-9) {
      return serverId;
    }
  }

  if (locations.length === 1) {
    return locations[0].location_id;
  }
  if (previousId == null) return null;
  const loc = locations.find((l) => l.location_id === previousId);
  if (!loc) return null;
  if (locationEffectiveStock(loc) <= 1e-9) return null;
  return previousId;
}
