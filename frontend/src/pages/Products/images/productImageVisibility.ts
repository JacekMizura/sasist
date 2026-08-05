/** Default visibility targets for product gallery (Sellasist-like, Sasist channels). */
export const PRODUCT_IMAGE_VISIBILITY_CHANNELS = [
  { id: "product_card", group: "Konto", label: "Karta produktu", color: "#334155" },
  { id: "sales_offers", group: "Konto", label: "Oferty sprzedażowe", color: "#ea580c" },
  { id: "lang_pl", group: "Język", label: "Polski", color: "#2563eb" },
] as const;

export type ProductImageVisibilityChannelId =
  (typeof PRODUCT_IMAGE_VISIBILITY_CHANNELS)[number]["id"];

export const DEFAULT_PRODUCT_IMAGE_VISIBILITY: ProductImageVisibilityChannelId[] =
  PRODUCT_IMAGE_VISIBILITY_CHANNELS.map((c) => c.id);

export function resolveImageVisibility(
  visibility: string[] | undefined | null,
): ProductImageVisibilityChannelId[] {
  if (!visibility || visibility.length === 0) return [...DEFAULT_PRODUCT_IMAGE_VISIBILITY];
  const allowed = new Set(PRODUCT_IMAGE_VISIBILITY_CHANNELS.map((c) => c.id));
  const filtered = visibility.filter((id): id is ProductImageVisibilityChannelId =>
    allowed.has(id as ProductImageVisibilityChannelId),
  );
  return filtered.length > 0 ? filtered : [...DEFAULT_PRODUCT_IMAGE_VISIBILITY];
}
