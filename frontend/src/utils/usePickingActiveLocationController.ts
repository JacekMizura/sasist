/**
 * Picking active source-location React lifecycle (testable SSOT).
 * Mirrors WmsPickingProductDetailPage write rules without mounting the full page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  nextActiveLocationIdAfterDetail,
  type ActiveLocationCandidate,
} from "./multiPickingActiveLocation";
import {
  resolvePickingSourceLocationScan,
  type PickingLocationScanCandidate,
  type PickingLocationScanResult,
} from "./pickingLocationScan";

export type PickingLocRow = PickingLocationScanCandidate & ActiveLocationCandidate;

export function usePickingActiveLocationController(opts: {
  productId: number;
  locations: PickingLocRow[];
  serverSourceLocationId?: number | null;
  needsLocationScan: boolean;
}) {
  const { productId, locations, serverSourceLocationId, needsLocationScan } = opts;
  const [activeLocationId, setActiveLocationId] = useState<number | null>(null);
  const [locationScanSatisfied, setLocationScanSatisfied] = useState(false);
  const explicitRef = useRef<number | null>(null);
  const prevProductRef = useRef(productId);

  // Product change → clear (never carry location across SKUs).
  useEffect(() => {
    if (prevProductRef.current === productId) return;
    prevProductRef.current = productId;
    explicitRef.current = null;
    setActiveLocationId(null);
    setLocationScanSatisfied(false);
  }, [productId]);

  // Detail refresh / source_lock — must not wipe explicit operator scan.
  useEffect(() => {
    setActiveLocationId((prev) =>
      nextActiveLocationIdAfterDetail({
        previousId: prev,
        locations,
        productChanged: false,
        serverSourceLocationId: serverSourceLocationId ?? null,
        operatorExplicitLocationId: explicitRef.current,
      }),
    );
  }, [locations, serverSourceLocationId, productId]);

  // Auto-select only when scan not required and no active yet.
  useEffect(() => {
    if (needsLocationScan) return;
    if (activeLocationId != null) {
      setLocationScanSatisfied(true);
      return;
    }
    if (locations.length === 1) {
      const only = locations[0].location_id;
      explicitRef.current = only;
      setActiveLocationId(only);
      setLocationScanSatisfied(true);
    }
  }, [needsLocationScan, activeLocationId, locations]);

  const selectedLocation = useMemo(
    () => locations.find((l) => l.location_id === activeLocationId) ?? null,
    [locations, activeLocationId],
  );

  const applyLocationScan = useCallback(
    (raw: string): PickingLocationScanResult => {
      const expected =
        selectedLocation?.location_code ??
        (locations.length === 1 ? locations[0].location_code : null) ??
        null;
      const result = resolvePickingSourceLocationScan({
        scan: raw,
        locations,
        expectedCode: expected,
      });
      if (result.kind === "accept") {
        explicitRef.current = result.location_id;
        setActiveLocationId(result.location_id);
        setLocationScanSatisfied(true);
      }
      // reject_wrong / not_location: do not mutate active
      return result;
    },
    [locations, selectedLocation?.location_code],
  );

  /** Explicit location_id for quick-pick — never invent locations[0] when multi. */
  const quickPickLocationId = useMemo(() => {
    if (activeLocationId != null && selectedLocation) return activeLocationId;
    return null;
  }, [activeLocationId, selectedLocation]);

  return {
    activeLocationId,
    selectedLocation,
    locationScanSatisfied,
    applyLocationScan,
    quickPickLocationId,
    explicitLocationId: () => explicitRef.current,
  };
}
