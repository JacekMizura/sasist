import { resolveDamageMediaUrl } from "../../../utils/resolveDamageMediaUrl";
import type { ComplaintLineDetail } from "../../../types/complaint";

export type LocalPreview = { key: string; url: string };

export function linePhotoUrls(line: ComplaintLineDetail): string[] {
  return Array.isArray(line.warehouse_photos)
    ? line.warehouse_photos.filter(Boolean).map((u) => resolveDamageMediaUrl(u))
    : [];
}

export function makeLocalPreview(url: string): LocalPreview {
  return { key: `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, url };
}

export function normalizePhotoRef(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith("/uploads/")) return s;
  try {
    const u = new URL(s);
    return `${u.pathname}${u.search ?? ""}`;
  } catch {
    return s;
  }
}

export function extractSessionPhotoUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const data = payload as Record<string, unknown>;
  const pools: unknown[] = [
    data.photos,
    data.photo_urls,
    data.urls,
    data.items,
    (data.session as Record<string, unknown> | undefined)?.photos,
    (data.session as Record<string, unknown> | undefined)?.photo_urls,
  ];
  const out: string[] = [];
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    for (const item of pool) {
      if (typeof item === "string" && item.trim()) out.push(item.trim());
      if (item && typeof item === "object") {
        const raw = (item as Record<string, unknown>).url ?? (item as Record<string, unknown>).photo_url;
        if (typeof raw === "string" && raw.trim()) out.push(raw.trim());
      }
    }
  }
  return Array.from(new Set(out));
}

export function isProbablyImageFile(f: File): boolean {
  if (f.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i.test(f.name.toLowerCase());
}
