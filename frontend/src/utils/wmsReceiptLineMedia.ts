import type { StockDocumentItemRead } from "../api/stockDocumentsApi";

/** Resolved line photo for WMS cards (API `image_url` + legacy `product_image_url`). */
export function wmsReceiptLineImageUrl(it: StockDocumentItemRead): string | null {
  const u = (it.image_url || it.product_image_url || "").trim();
  return u || null;
}
