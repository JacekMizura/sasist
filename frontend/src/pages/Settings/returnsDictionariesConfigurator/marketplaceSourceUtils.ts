/** Rozpoznawanie logotypu kanału sprzedaży po `code` lub etykiecie (tylko UI). */
const MARKETPLACE_LOGO: Record<string, string> = {
  allegro: "/assets/marketplaces/allegro.svg",
  amazon: "/assets/marketplaces/amazon.svg",
  erli: "/assets/marketplaces/erli.svg",
  shoper: "/assets/marketplaces/shoper.svg",
  prestashop: "/assets/marketplaces/prestashop.svg",
  woocommerce: "/assets/marketplaces/woocommerce.svg",
  empik: "/assets/marketplaces/empik.svg",
  ebay: "/assets/marketplaces/ebay.svg",
  shop: "/assets/marketplaces/shop.svg",
};

export type OrderSourceMarketplacePreset = {
  code: string;
  label: string;
  logoPath: string | null;
};

export const ORDER_SOURCE_MARKETPLACE_PRESETS: OrderSourceMarketplacePreset[] = [
  { code: "allegro", label: "Allegro", logoPath: MARKETPLACE_LOGO.allegro },
  { code: "amazon", label: "Amazon", logoPath: MARKETPLACE_LOGO.amazon },
  { code: "erli", label: "Erli", logoPath: MARKETPLACE_LOGO.erli },
  { code: "shoper", label: "Shoper", logoPath: MARKETPLACE_LOGO.shoper },
  { code: "prestashop", label: "PrestaShop", logoPath: MARKETPLACE_LOGO.prestashop },
  { code: "woocommerce", label: "WooCommerce", logoPath: MARKETPLACE_LOGO.woocommerce },
  { code: "empik", label: "Empik", logoPath: MARKETPLACE_LOGO.empik },
  { code: "ebay", label: "eBay", logoPath: MARKETPLACE_LOGO.ebay },
  { code: "shop", label: "Sklep", logoPath: MARKETPLACE_LOGO.shop },
];

export function resolveOrderSourceLogoPath(code: string, label: string): string | null {
  const c = code.trim().toLowerCase();
  if (MARKETPLACE_LOGO[c]) return MARKETPLACE_LOGO[c];
  const norm = label.trim().toLowerCase();
  for (const [key, path] of Object.entries(MARKETPLACE_LOGO)) {
    if (norm === key || norm.includes(key)) return path;
  }
  return null;
}

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
