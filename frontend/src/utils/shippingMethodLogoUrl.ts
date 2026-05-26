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

/** Prefer API logo; else heuristic from carrier name string. */
export function shippingMethodLogoForDisplay(
  logoUrl: string | null | undefined,
  methodName: string | null | undefined,
): string | null {
  const resolved = resolveShippingMethodLogoUrl(logoUrl);
  if (resolved) return resolved;
  return packingCourierLogoSrc(methodName ?? "");
}
