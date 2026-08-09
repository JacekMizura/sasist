import { getBackendPublicOrigin } from "../config/apiBase";
import { packingCourierLogoSrc } from "./packingCourierLogo";

/** Turn stored `/uploads/...` into absolute URL when API is on another origin. */
export function resolveShippingMethodLogoUrl(logoUrl: string | null | undefined): string | null {
  if (!logoUrl || typeof logoUrl !== "string") return null;
  const u = logoUrl.trim();
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) {
    const origin = getBackendPublicOrigin();
    return origin ? `${origin}${u}` : u;
  }
  return u;
}

export type ShippingMethodLogoSource = "custom" | "heuristic" | "none";

export type ShippingMethodLogoPick = {
  src: string | null;
  source: ShippingMethodLogoSource;
};

/**
 * One-way pick: custom → heuristic → none.
 * Once ``customFailed`` / ``heuristicFailed`` is set, never go back to that source
 * (avoids onError loops that re-hit a broken ``/uploads/...``).
 */
export function pickShippingMethodLogoSrc(
  logoUrl: string | null | undefined,
  methodName: string | null | undefined,
  opts?: { customFailed?: boolean; heuristicFailed?: boolean },
): ShippingMethodLogoPick {
  const custom = resolveShippingMethodLogoUrl(logoUrl);
  const heuristic = packingCourierLogoSrc(methodName ?? "");
  if (custom && !opts?.customFailed) {
    return { src: custom, source: "custom" };
  }
  if (heuristic && !opts?.heuristicFailed) {
    return { src: heuristic, source: "heuristic" };
  }
  return { src: null, source: "none" };
}

/** Prefer API logo; else heuristic from carrier name string. */
export function shippingMethodLogoForDisplay(
  logoUrl: string | null | undefined,
  methodName: string | null | undefined,
): string | null {
  return pickShippingMethodLogoSrc(logoUrl, methodName).src;
}
