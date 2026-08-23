/**
 * Picking source-location scan resolution (SSOT for detail handler).
 *
 * Allowed locations = product detail routing rows only — never invent inventory FIFO.
 * location_like codes that are not in that set → WRONG_LOCATION (do not mutate active).
 */

import { normalizeScanEan } from "./wmsScanNormalize";
import { classifyWmsScanCode } from "./wmsScanClassify";

export type PickingLocationScanCandidate = {
  location_id: number;
  location_code?: string | null;
};

export type PickingLocationScanResult =
  | { kind: "not_location" }
  | { kind: "accept"; location_id: number; location_code: string }
  | { kind: "reject_wrong"; scanned: string; expected: string | null };

export function locationRowMatchesScan(
  loc: PickingLocationScanCandidate,
  scan: string,
): boolean {
  const b = normalizeScanEan(scan).toUpperCase();
  if (!b) return false;
  const code = normalizeScanEan(loc.location_code ?? "").toUpperCase();
  const idStr = String(loc.location_id);
  if (code && (b === code || b.endsWith(code) || code.endsWith(b))) return true;
  if (b === idStr.toUpperCase() || b.endsWith(idStr) || idStr.endsWith(b)) return true;
  return false;
}

export function formatWrongLocationMessage(expected: string | null, scanned: string): string {
  const exp = (expected ?? "").trim() || "wskazaną lokalizację";
  const sc = (scanned ?? "").trim() || "—";
  return `Zeskanowano nieprawidłową lokalizację. Oczekiwana: ${exp}, zeskanowana: ${sc}.`;
}

/**
 * Resolve a raw scan against route-allowed locations for the current product.
 * Match wins even when the code is not heuristically location_like (e.g. numeric id).
 * Heuristic location_like with no match → reject_wrong (never silent consume).
 */
export function resolvePickingSourceLocationScan(args: {
  scan: string;
  locations: PickingLocationScanCandidate[];
  expectedCode?: string | null;
}): PickingLocationScanResult {
  const scan = normalizeScanEan(args.scan);
  if (!scan) return { kind: "not_location" };

  const hit = args.locations.find((loc) => locationRowMatchesScan(loc, scan));
  if (hit) {
    return {
      kind: "accept",
      location_id: hit.location_id,
      location_code: (hit.location_code ?? "").trim() || String(hit.location_id),
    };
  }

  if (classifyWmsScanCode(scan) === "location_like") {
    const expected =
      (args.expectedCode ?? "").trim() ||
      (args.locations.length === 1 ? (args.locations[0].location_code ?? "").trim() : "") ||
      null;
    return { kind: "reject_wrong", scanned: scan, expected };
  }

  return { kind: "not_location" };
}
