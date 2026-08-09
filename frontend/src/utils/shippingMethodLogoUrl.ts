import { getBackendPublicOrigin } from "../config/apiBase";
import { packingCourierLogoSrc } from "./packingCourierLogo";

/** Stored `/uploads/...` paths that already failed to load — survives remounts. */
const failedCustomLogoKeys = new Set<string>();

export function shippingMethodCustomLogoKey(logoUrl: string | null | undefined): string | null {
  if (!logoUrl || typeof logoUrl !== "string") return null;
  const u = logoUrl.trim();
  if (!u) return null;
  try {
    if (u.startsWith("http://") || u.startsWith("https://")) {
      const path = new URL(u).pathname;
      return path.startsWith("/uploads/") ? path : u;
    }
  } catch {
    /* keep raw */
  }
  return u.startsWith("/") ? u : u;
}

export function markShippingMethodCustomLogoFailed(logoUrl: string | null | undefined): void {
  const key = shippingMethodCustomLogoKey(logoUrl);
  if (key) failedCustomLogoKeys.add(key);
}

export function isShippingMethodCustomLogoFailed(logoUrl: string | null | undefined): boolean {
  const key = shippingMethodCustomLogoKey(logoUrl);
  return key != null && failedCustomLogoKeys.has(key);
}

/** Test helper — do not use in product UI. */
export function clearShippingMethodCustomLogoFailuresForTests(): void {
  failedCustomLogoKeys.clear();
}

/** Turn stored `/uploads/...` into a stable browser src. Prefer relative when same-origin. */
export function resolveShippingMethodLogoUrl(logoUrl: string | null | undefined): string | null {
  if (!logoUrl || typeof logoUrl !== "string") return null;
  const u = logoUrl.trim();
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) {
    const origin = getBackendPublicOrigin();
    if (!origin) return u;
    // Same-origin (Vite `/uploads` proxy): keep relative — stable src, browser cache, no remount churn.
    if (typeof window !== "undefined" && origin === window.location.origin) {
      return u;
    }
    return `${origin}${u}`;
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
 * Honours module-level failure cache so remounts do not re-hit a dead `/uploads/...`.
 */
export function pickShippingMethodLogoSrc(
  logoUrl: string | null | undefined,
  methodName: string | null | undefined,
  opts?: { customFailed?: boolean; heuristicFailed?: boolean },
): ShippingMethodLogoPick {
  const customFailed = Boolean(opts?.customFailed) || isShippingMethodCustomLogoFailed(logoUrl);
  const custom = resolveShippingMethodLogoUrl(logoUrl);
  const heuristic = packingCourierLogoSrc(methodName ?? "");
  if (custom && !customFailed) {
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

/** Soft refresh must keep an existing list mounted so <img> are not aborted. */
export function shippingMethodsShouldUnmountList(loading: boolean, rowCount: number): boolean {
  return loading && rowCount === 0;
}
