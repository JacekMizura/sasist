import type { DevScannerObjectKind } from "../../utils/devScannerStorage";

export type DevScannerCategoryId =
  | "all"
  | "carts"
  | "carts_with_baskets"
  | "baskets"
  | "products"
  | "locations"
  | "carriers"
  | "orders"
  | "other"
  | "favorites";

export type DevScannerCategoryDef = {
  id: DevScannerCategoryId;
  label: string;
};

export const DEV_SCANNER_CATEGORIES: DevScannerCategoryDef[] = [
  { id: "all", label: "Wszystkie" },
  { id: "carts", label: "Wózki" },
  { id: "carts_with_baskets", label: "Wózki z koszykami" },
  { id: "baskets", label: "Koszyki" },
  { id: "products", label: "Produkty" },
  { id: "locations", label: "Lokalizacje" },
  { id: "carriers", label: "Nośniki / SSCC" },
  { id: "orders", label: "Zamówienia" },
  { id: "other", label: "Inne kody" },
  { id: "favorites", label: "Ulubione" },
];

export function itemMatchesCategory(
  kind: DevScannerObjectKind,
  category: DevScannerCategoryId,
  opts?: { basketCount?: number; isFavorite?: boolean; cartType?: "BULK" | "MULTI" },
): boolean {
  if (category === "all") return true;
  if (category === "favorites") return Boolean(opts?.isFavorite);
  if (category === "carts") return kind === "cart";
  if (category === "carts_with_baskets") {
    return kind === "cart" && ((opts?.basketCount ?? 0) > 0 || opts?.cartType === "MULTI");
  }
  if (category === "baskets") return kind === "basket";
  if (category === "products") return kind === "product";
  if (category === "locations") return kind === "location";
  if (category === "carriers") return kind === "carrier";
  if (category === "orders") return kind === "order";
  if (category === "other") return kind === "other";
  return true;
}
