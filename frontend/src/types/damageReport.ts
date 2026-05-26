export type DamageType = "mechanical" | "missing_parts" | "flood" | "other";
export type DamageReportStatus = "draft" | "confirmed";
export type DamageEntryStatus = "NEW" | "REVIEWED" | "INCLUDED_IN_REPORT";
export type DamageDecision = "SELLABLE" | "REPAIR" | "RETURN_TO_SUPPLIER" | "DISPOSE";

export type DamageReportItem = {
  id: number;
  product_id: number | null;
  product_name: string;
  sku: string | null;
  location_uuid: string;
  location_label: string | null;
  quantity: number;
  purchase_price: number;
  total_value: number;
  damage_type: DamageType;
  description: string | null;
  decision?: DamageDecision | null;
  image_urls: string[];
};

export type DamageReport = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  warehouse_name: string | null;
  report_number: string;
  created_at: string;
  created_by: string | null;
  status: DamageReportStatus;
  total_value: number;
  items: DamageReportItem[];
};

export type DamageReportCreateItem = {
  product_id: number;
  location_uuid: string;
  quantity: number;
  damage_type: DamageType;
  description?: string;
  image_urls?: string[];
};

export type DamageReportCreatePayload = {
  tenant_id: number;
  warehouse_id: number;
  created_by?: string;
  items?: DamageReportCreateItem[];
  entry_ids?: number[];
};

export type DamageEntry = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  product_id: number | null;
  product_name: string;
  sku: string | null;
  location_uuid: string;
  location_label: string | null;
  quantity: number;
  /** First image (legacy); prefer `photo_urls`. */
  photo_url: string;
  /** All evidence images for this entry. */
  photo_urls: string[];
  created_at: string;
  created_by: string | null;
  status: DamageEntryStatus;
  damage_type: DamageType | null;
  description: string | null;
  decision: DamageDecision | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  purchase_price: number;
  total_value: number;
};

export type DamageEntryCreatePayload = {
  tenant_id: number;
  warehouse_id: number;
  product_id: number;
  /** Optional; omit for WMS/returns without bin placement. */
  location_uuid?: string;
  quantity: number;
  /** Paths like `/uploads/…` or http(s) URLs — not data:/blob: URLs. */
  photo_urls?: string[];
  created_by?: string;
  /** Legacy enum or comma-separated RMZ codes */
  damage_type?: DamageType | string;
};

export type DamageEntryReviewPayload = {
  damage_type: DamageType;
  description?: string;
  decision: DamageDecision;
  reviewed_by?: string;
};

export type DamageCandidate = {
  productId: number;
  productName: string;
  sku?: string;
  /** Product thumbnail for WMS cards (from catalog). */
  imageUrl?: string;
  locationUUID: string;
  locationLabel: string;
  availableQuantity: number;
  purchasePrice: number;
};
