import type { DevScannerObjectKind } from "../../utils/devScannerStorage";

export type { DevScannerObjectKind };

export type DevScannerCatalogItem = {
  id: string;
  kind: DevScannerObjectKind;
  /** Code sent to handleScan */
  code: string;
  name: string;
  subtitle?: string;
  meta?: string;
  relationLabel?: string;
  parentCartCode?: string;
  parentCartName?: string;
  cartId?: number;
  basketCount?: number;
  productId?: number;
  imageUrl?: string | null;
  sku?: string | null;
  ean?: string | null;
  cartType?: "BULK" | "MULTI";
  children?: DevScannerCatalogItem[];
};

export function objectKindLabel(kind: DevScannerObjectKind): string {
  switch (kind) {
    case "cart":
      return "Wózek";
    case "basket":
      return "Koszyk";
    case "product":
      return "Produkt";
    case "location":
      return "Lokalizacja";
    case "carrier":
      return "Nośnik / SSCC";
    case "order":
      return "Zamówienie";
    default:
      return "Inny kod";
  }
}
