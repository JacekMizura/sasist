/**
 * MULTI quantity-mode: UI active location vs server source acceptance.
 *
 * activeLocationId ≠ source_lock. Basket confirm requires server SOURCE_ACCEPTED.
 */

export type SourceAcceptancePhase =
  | "SELECT_SOURCE"
  | "SOURCE_ACCEPTING"
  | "SOURCE_ACCEPTED"
  | "SELECT_BASKET";

export type SourceLockLike = {
  product_id?: number | null;
  location_id?: number | null;
} | null | undefined;

export function serverSourceLocationId(
  sourceLock: SourceLockLike,
  productId: number,
): number | null {
  if (!sourceLock) return null;
  const pid = Number(sourceLock.product_id);
  const lid = Number(sourceLock.location_id);
  if (!Number.isFinite(pid) || pid !== Math.floor(productId)) return null;
  if (!Number.isFinite(lid) || lid <= 0) return null;
  return Math.floor(lid);
}

/** True when server source_lock matches this product + location. */
export function isServerSourceAccepted(
  sourceLock: SourceLockLike,
  productId: number,
  locationId: number | null | undefined,
): boolean {
  if (locationId == null || locationId <= 0) return false;
  return serverSourceLocationId(sourceLock, productId) === Math.floor(locationId);
}

/**
 * May call accept-source-location without a fresh physical scan:
 * - continuous flow: same location previously accepted for this product session
 * - explicit UI selection (scan/tap) this visit
 * - single-location auto (only one shelf row)
 *
 * Never: bare activeLocationId / locations[0] without one of the above.
 */
export function mayAcceptOrReacceptSource(args: {
  locationId: number;
  lastOperatorAcceptedLocationId: number | null;
  explicitSelectionLocationId: number | null;
  locationCount: number;
  singleLocationId: number | null;
}): boolean {
  const lid = Math.floor(args.locationId);
  if (lid <= 0) return false;
  if (args.lastOperatorAcceptedLocationId === lid) return true;
  if (args.explicitSelectionLocationId === lid) return true;
  if (
    args.locationCount === 1 &&
    args.singleLocationId != null &&
    args.singleLocationId === lid
  ) {
    return true;
  }
  return false;
}

export function deriveSourceAcceptancePhase(args: {
  requiresBasketPut: boolean;
  activeLocationId: number | null;
  sourceLock: SourceLockLike;
  productId: number;
  accepting: boolean;
}): SourceAcceptancePhase {
  if (!args.requiresBasketPut) return "SELECT_BASKET";
  if (args.accepting) return "SOURCE_ACCEPTING";
  if (isServerSourceAccepted(args.sourceLock, args.productId, args.activeLocationId)) {
    return "SELECT_BASKET";
  }
  if (args.activeLocationId != null) return "SELECT_SOURCE";
  return "SELECT_SOURCE";
}
