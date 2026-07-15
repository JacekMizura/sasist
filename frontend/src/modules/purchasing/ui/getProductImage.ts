import { getBackendPublicOrigin } from "../../../config/apiBase";

const IMAGE_KEYS = [
  "image_url",
  "imageUrl",
  "photo_url",
  "image",
  "main_image_url",
  "thumbnail_url",
  "image_path",
  "image_filename",
  "product_image_url",
  "primary_image_url",
] as const;

function firstNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const first = value
    .trim()
    .split(";")
    .map((s) => s.trim())
    .find(Boolean);
  return first || null;
}

/** Absolute / browser-loadable URL (relative `/uploads/...` → backend origin). */
export function toAbsoluteProductImageUrl(raw: string | null | undefined): string | null {
  const first = firstNonEmptyString(raw);
  if (!first) return null;
  if (first.startsWith("data:") || first.startsWith("http://") || first.startsWith("https://") || first.startsWith("blob:")) {
    return first;
  }
  if (first.startsWith("/")) {
    const origin = getBackendPublicOrigin().replace(/\/+$/, "");
    return origin ? `${origin}${first}` : first;
  }
  // Bare filename from legacy storage — treat as upload path.
  if (!first.includes("/") && !first.includes("\\")) {
    const origin = getBackendPublicOrigin().replace(/\/+$/, "");
    const path = `/uploads/${first}`;
    return origin ? `${origin}${path}` : path;
  }
  return first;
}

function pickRawCandidate(product: Record<string, unknown> | null | undefined): string | null {
  if (!product) return null;
  for (const key of IMAGE_KEYS) {
    const found = firstNonEmptyString(product[key]);
    if (found) return found;
  }
  const nested = product.product;
  if (nested && typeof nested === "object") {
    return pickRawCandidate(nested as Record<string, unknown>);
  }
  return null;
}

/**
 * Single SSOT for product image URLs in Zakupy.
 * Accepts product DTOs, nested `{ product }`, or a bare URL string.
 */
export function getProductImage(product: unknown): string | null {
  if (product == null) return null;
  if (typeof product === "string") return toAbsoluteProductImageUrl(product);
  if (typeof product !== "object") return null;
  return toAbsoluteProductImageUrl(pickRawCandidate(product as Record<string, unknown>));
}
