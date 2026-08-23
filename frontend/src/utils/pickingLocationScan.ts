/**
 * Picking source-location scan resolution (SSOT for detail handler).
 *
 * Allowed locations = product detail routing rows only — never invent inventory FIFO.
 * location_like codes that are not in that set → WRONG_LOCATION (do not mutate active).
 *
 * Matching is STRICT equality on location_code / numeric location_id.
 * Never use endsWith — "B3-C-1".endsWith("1") falsely matches location_id=1 (A1).
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

/** Strip optional LOC-/LOC_ prefix; uppercase; trim. */
export function normalizeLocationScanKey(raw: string): string {
  let s = normalizeScanEan(raw).toUpperCase();
  if (s.startsWith("LOC-") || s.startsWith("LOC_")) s = s.slice(4);
  return s;
}

export function locationRowMatchesScan(
  loc: PickingLocationScanCandidate,
  scan: string,
): boolean {
  const b = normalizeLocationScanKey(scan);
  if (!b) return false;
  const code = normalizeLocationScanKey(loc.location_code ?? "");
  if (code && b === code) return true;
  // Exact numeric id only — never endsWith (B3-C-1 must not match id=1).
  const idStr = String(loc.location_id);
  if (/^\d+$/.test(b) && b === idStr) return true;
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
