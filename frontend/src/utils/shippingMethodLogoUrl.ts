import { getBackendPublicOrigin } from "../config/apiBase";
import { packingCourierLogoSrc } from "./packingCourierLogo";

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
 * Failure is local to the component instance (opts) — never a module cache.
 * A module cache treated StrictMode/abort onError as permanent failure and flipped src mid-load.
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

/** @deprecated use shippingMethodsShouldUnmountList from shippingMethodsListLifecycle */
export { shippingMethodsShouldUnmountList } from "./shippingMethodsListLifecycle";
