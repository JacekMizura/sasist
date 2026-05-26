import { getBackendPublicOrigin } from "../config/apiBase";



/** Turn stored damage paths (`/uploads/...`) into absolute URLs for <img src>. */

export function resolveDamageMediaUrl(url: string): string {

  const u = String(url ?? "").trim();

  if (!u) return u;

  if (u.startsWith("data:") || u.startsWith("http://") || u.startsWith("https://")) return u;

  if (u.startsWith("/uploads/")) {
    const origin = getBackendPublicOrigin();
    if (!origin) return u;
    return origin + u;
  }

  return u;

}

