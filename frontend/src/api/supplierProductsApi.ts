import api from "./axios";

export type SupplierProductCatalogKind = "product" | "carton" | "packaging";

export type SupplierCatalogPriceTier = { qty_from: number; unit_net: number };

export type SupplierProductCatalogItem = {
  row_uid: string;
  catalog_kind: SupplierProductCatalogKind;
  /** supplier_products.id — tylko dla catalog_kind === "product" */
  id?: number | null;
  supplier_id: number;
  product_id?: number | null;
  wm_kind?: "carton" | "packaging" | null;
  wm_id?: string | null;
  warehouse_id?: number | null;
  name: string;
  sku?: string | null;
  ean?: string | null;
  image_url?: string | null;
  purchase_price?: number | null;
  price_tiers?: SupplierCatalogPriceTier[];
  lead_time_days?: number | null;
  min_order_qty?: number | null;
  purchase_pack_qty?: number | null;
  free_shipping_threshold_net?: number | null;
  vat_rate: number;
  is_default_supplier: boolean;
  manufacturer_id?: number | null;
  manufacturer_name?: string | null;
  /** Widoczny stan (suma inventory) */
  stock_on_hand?: number | null;
  /** Suma rezerwacji (status reserved) */
  stock_reserved?: number | null;
};

export type SupplierCatalogScope = "products" | "cartons" | "packaging" | "all";

export async function listSupplierProducts(
  tenantId: number,
  supplierId: number,
  params?: { search?: string; manufacturer_id?: number; catalog_scope?: SupplierCatalogScope },
): Promise<SupplierProductCatalogItem[]> {
  const res = await api.get<SupplierProductCatalogItem[]>("/supplier-products/", {
    params: {
      tenant_id: tenantId,
      supplier_id: supplierId,
      search: params?.search?.trim() || undefined,
      manufacturer_id: params?.manufacturer_id != null && params.manufacturer_id >= 1 ? params.manufacturer_id : undefined,
      catalog_scope: params?.catalog_scope ?? "all",
    },
  });
  return res.data;
}

/** Up to 5 catalog products most often ordered from this supplier (non-draft, non-cancelled deliveries). */
export async function listSupplierTopProducts(
  tenantId: number,
  supplierId: number,
  params?: { manufacturer_id?: number },
): Promise<SupplierProductCatalogItem[]> {
  const res = await api.get<SupplierProductCatalogItem[]>("/supplier-products/top", {
    params: {
      tenant_id: tenantId,
      supplier_id: supplierId,
      manufacturer_id: params?.manufacturer_id != null && params.manufacturer_id >= 1 ? params.manufacturer_id : undefined,
    },
  });
  return res.data;
}

export type SupplierLinkedManufacturer = { id: number; name: string; active: boolean };

export async function listSupplierLinkedManufacturers(
  tenantId: number,
  supplierId: number,
): Promise<SupplierLinkedManufacturer[]> {
  const res = await api.get<SupplierLinkedManufacturer[]>("/supplier-products/linked-manufacturers", {
    params: { tenant_id: tenantId, supplier_id: supplierId },
  });
  return res.data;
}
