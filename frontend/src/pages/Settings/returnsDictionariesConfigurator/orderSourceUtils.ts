import { getBackendPublicOrigin } from "../../../config/apiBase";

export const ORDER_SOURCE_LOGO_ACCEPT =
  "image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function slugDictionaryCode(prefix: string, label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!slug) return `${prefix}_${Date.now()}`;
  return slug.startsWith(`${prefix}_`) ? slug : `${prefix}_${slug}`;
}

export function validateOrderSourceLogoFile(file: File): string | null {
  const byExt = /\.(png|jpe?g|webp|svg)$/i.test(file.name);
  const byType = /^(image\/(png|jpeg|webp|svg\+xml))$/i.test(file.type);
  if (!byExt && !byType) return "Dozwolone formaty: PNG, JPG, WebP, SVG";
  if (file.size > MAX_LOGO_BYTES) return "Plik za duży (max 2 MB)";
  return null;
}

/** URL logo do `<img src>` — uploady z backendu lub ścieżka statyczna frontendu. */
export function resolveOrderSourceLogoUrl(logoUrl: string | null | undefined): string | null {
  const u = String(logoUrl ?? "").trim();
  if (!u) return null;
  if (u.startsWith("data:") || u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/uploads/")) {
    const origin = getBackendPublicOrigin();
    return origin ? origin + u : u;
  }
  return u;
}

export function orderSourceInitialLetter(label: string): string {
  const t = label.trim();
  if (!t) return "";
  const ch = t.charAt(0).toUpperCase();
  return /[A-Z0-9ĄĆĘŁŃÓŚŹŻ]/i.test(ch) ? ch.toUpperCase() : "?";
}
