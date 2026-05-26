import type { AssignedLocation } from "../../types/warehouse";

/** Normalized product row shared by list + edit page fetch. */
export type ProductListRow = {
  id: number;
  tenant_id?: number;
  name?: string;
  ean?: string;
  symbol?: string;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  volume?: number;
  purchase_price?: number | null;
  extra_cost_packaging_net?: number | null;
  extra_cost_commission_percent?: number | null;
  extra_cost_other_net?: number | null;
  previous_purchase_price?: number | null;
  purchase_price_original?: number | null;
  purchase_currency?: string | null;
  last_purchase_date?: string | null;
  last_supplier_id?: number | null;
  last_supplier_brief?: { id: number; name: string } | null;
  last_purchase_currency?: string | null;
  sale_price?: number | null;
  manufacturer?: string | null;
  manufacturer_id?: number | null;
  manufacturer_brief?: { id: number; name: string; logo_url?: string | null } | null;
  default_supplier_id?: number | null;
  default_supplier_brief?: { id: number; name: string } | null;
  gpsr_responsible_name?: string | null;
  gpsr_responsible_email?: string | null;
  unit?: string | null;
  image_url?: string;
  assignedLocations?: AssignedLocation[];
  locations?: {
    name: string;
    quantity: number;
    warehouse_id?: number;
    storage_type?: string;
    location_uuid?: string | null;
  }[];
  inventory?: {
    location_id: number;
    location_code: string;
    location_type: string;
    quantity: number;
    batch?: string | null;
    expiry?: string | null;
    warehouse_id?: number;
    location_uuid?: string | null;
    stock_disposition?: string | null;
    disposition_badge?: string | null;
    warehouse_carrier_id?: number | null;
    carrier_code?: string | null;
    carrier_barcode?: string | null;
    carrier_is_mixed?: boolean;
  }[];
  label_template_id?: number | null;
  stock_quantity?: number;
  inventory_value?: number | null;
  average_purchase_price?: number | null;
  current_cost?: {
    purchase_net?: number | null;
    extra_cost_net?: number | null;
    landed_cost_net?: number | null;
    vat_percent?: number | null;
    sale_net?: number | null;
    sale_gross?: number | null;
    margin_value?: number | null;
    margin_percent?: number | null;
    updated_at?: string | null;
    source?: string | null;
  } | null;
  rotation_30d?: number;
  days_of_stock?: number | null;
  metadata_json?: Record<string, unknown> | null;
  min_pick_quantity?: number | null;
  max_pick_quantity?: number | null;
  min_reserve_quantity?: number | null;
  max_reserve_quantity?: number | null;
  enable_stock_alert?: boolean;
  min_total_stock?: number | null;
  bulk_ean?: string | null;
  units_per_carton?: number | null;
  carton_length_cm?: number | null;
  carton_width_cm?: number | null;
  carton_height_cm?: number | null;
  carton_weight_kg?: number | null;
  carton_volume_dm3?: number | null;
  product_orientation_type?: string | null;
  product_shape_type?: string | null;
  product_stack_compressible?: boolean | null;
  product_compressed_height_cm?: number | null;
  product_max_stack_weight?: number | null;
  product_stack_behavior?: string | null;
  orientation_type?: string | null;
  shape_type?: string | null;
  stack_compressible?: boolean | null;
  compressed_height_cm?: number | null;
  max_stack_weight?: number | null;
  stack_behavior?: string | null;
  carton_orientation_type?: string | null;
  carton_shape_type?: string | null;
  carton_stack_compressible?: boolean | null;
  carton_compressed_height_cm?: number | null;
  carton_max_stack_weight?: number | null;
  carton_stack_behavior?: string | null;
  track_batch?: boolean;
  track_expiry?: boolean;
  track_serial?: boolean;
  require_recv_height?: boolean;
  require_recv_width?: boolean;
  require_recv_length?: boolean;
  require_recv_weight?: boolean;
  require_recv_master_carton?: boolean;
  require_recv_master_carton_ean?: boolean;
  require_recv_master_carton_qty?: boolean;
  require_recv_master_carton_dims?: boolean;
  require_recv_master_carton_weight?: boolean;
};

export function mapProductListRow(p: Record<string, unknown>): ProductListRow {
  const invValRaw = p.inventory_value;
  const invVal =
    invValRaw === null
      ? null
      : invValRaw !== undefined && invValRaw !== "" && Number.isFinite(Number(invValRaw))
        ? Number(invValRaw)
        : undefined;
  const avgPur =
    p.average_purchase_price === null
      ? null
      : p.average_purchase_price !== undefined && Number.isFinite(Number(p.average_purchase_price))
        ? Number(p.average_purchase_price)
        : undefined;
  return {
    ...p,
    id: Number(p.id),
    sale_price: p.sale_price != null ? Number(p.sale_price) : null,
    purchase_price: p.purchase_price != null ? Number(p.purchase_price) : null,
    extra_cost_packaging_net: p.extra_cost_packaging_net != null ? Number(p.extra_cost_packaging_net) : null,
    extra_cost_commission_percent: p.extra_cost_commission_percent != null ? Number(p.extra_cost_commission_percent) : null,
    extra_cost_other_net: p.extra_cost_other_net != null ? Number(p.extra_cost_other_net) : null,
    previous_purchase_price: p.previous_purchase_price != null ? Number(p.previous_purchase_price) : null,
    purchase_price_original: p.purchase_price_original != null ? Number(p.purchase_price_original) : null,
    purchase_currency: p.purchase_currency != null ? String(p.purchase_currency) : null,
    last_purchase_date: p.last_purchase_date != null ? String(p.last_purchase_date) : null,
    last_supplier_id: p.last_supplier_id != null ? Number(p.last_supplier_id) : null,
    last_supplier_brief:
      p.last_supplier_brief != null && typeof p.last_supplier_brief === "object"
        ? {
            id: Number((p.last_supplier_brief as { id: unknown }).id),
            name: String((p.last_supplier_brief as { name?: unknown }).name ?? ""),
          }
        : null,
    last_purchase_currency: p.last_purchase_currency != null ? String(p.last_purchase_currency) : null,
    stock_quantity: p.stock_quantity != null ? Number(p.stock_quantity) : undefined,
    inventory_value: invVal,
    average_purchase_price: avgPur,
    current_cost:
      p.current_cost != null && typeof p.current_cost === "object"
        ? ({
            purchase_net:
              (p.current_cost as Record<string, unknown>).purchase_net != null
                ? Number((p.current_cost as Record<string, unknown>).purchase_net)
                : null,
            extra_cost_net:
              (p.current_cost as Record<string, unknown>).extra_cost_net != null
                ? Number((p.current_cost as Record<string, unknown>).extra_cost_net)
                : null,
            landed_cost_net:
              (p.current_cost as Record<string, unknown>).landed_cost_net != null
                ? Number((p.current_cost as Record<string, unknown>).landed_cost_net)
                : null,
            vat_percent:
              (p.current_cost as Record<string, unknown>).vat_percent != null
                ? Number((p.current_cost as Record<string, unknown>).vat_percent)
                : null,
            sale_net:
              (p.current_cost as Record<string, unknown>).sale_net != null
                ? Number((p.current_cost as Record<string, unknown>).sale_net)
                : null,
            sale_gross:
              (p.current_cost as Record<string, unknown>).sale_gross != null
                ? Number((p.current_cost as Record<string, unknown>).sale_gross)
                : null,
            margin_value:
              (p.current_cost as Record<string, unknown>).margin_value != null
                ? Number((p.current_cost as Record<string, unknown>).margin_value)
                : null,
            margin_percent:
              (p.current_cost as Record<string, unknown>).margin_percent != null
                ? Number((p.current_cost as Record<string, unknown>).margin_percent)
                : null,
            updated_at:
              (p.current_cost as Record<string, unknown>).updated_at != null
                ? String((p.current_cost as Record<string, unknown>).updated_at)
                : null,
            source:
              (p.current_cost as Record<string, unknown>).source != null
                ? String((p.current_cost as Record<string, unknown>).source)
                : null,
          } as ProductListRow["current_cost"])
        : null,
    assignedLocations: Array.isArray(p.assigned_locations)
      ? (p.assigned_locations as AssignedLocation[])
      : Array.isArray(p.assignedLocations)
        ? (p.assignedLocations as AssignedLocation[])
        : undefined,
    locations: Array.isArray(p.locations)
      ? (p.locations as Record<string, unknown>[]).map((loc) => ({
          name: String(loc.name ?? "").trim() || "—",
          quantity: Number(loc.quantity) || 0,
          warehouse_id: loc.warehouse_id != null ? Number(loc.warehouse_id) : undefined,
          storage_type: typeof loc.storage_type === "string" ? loc.storage_type : undefined,
          location_uuid:
            typeof loc.location_uuid === "string" && loc.location_uuid.trim() !== "" ? loc.location_uuid.trim() : null,
        }))
      : undefined,
    inventory: Array.isArray(p.inventory)
      ? (p.inventory as Record<string, unknown>[]).map((row) => {
          const sdRaw = row.stock_disposition != null ? String(row.stock_disposition).trim() : "";
          const dbRaw = row.disposition_badge != null ? String(row.disposition_badge).trim() : "";
          return {
            location_id: Number(row.location_id) || 0,
            location_code: String(row.location_code ?? "").trim() || "—",
            location_type: String(row.location_type ?? "UNKNOWN"),
            quantity: Number(row.quantity) || 0,
            batch: row.batch != null && String(row.batch).trim() !== "" ? String(row.batch) : null,
            expiry: row.expiry != null && String(row.expiry).trim() !== "" ? String(row.expiry) : null,
            warehouse_id: row.warehouse_id != null ? Number(row.warehouse_id) : undefined,
            location_uuid:
              typeof row.location_uuid === "string" && row.location_uuid.trim() !== "" ? row.location_uuid.trim() : null,
            stock_disposition: sdRaw !== "" ? sdRaw : null,
            disposition_badge: dbRaw !== "" ? dbRaw : null,
            warehouse_carrier_id:
              row.warehouse_carrier_id != null && Number(row.warehouse_carrier_id) > 0
                ? Number(row.warehouse_carrier_id)
                : null,
            carrier_code: row.carrier_code != null && String(row.carrier_code).trim() !== "" ? String(row.carrier_code).trim() : null,
            carrier_barcode:
              row.carrier_barcode != null && String(row.carrier_barcode).trim() !== "" ? String(row.carrier_barcode).trim() : null,
            carrier_is_mixed: Boolean(row.carrier_is_mixed),
          };
        })
      : undefined,
    metadata_json:
      p.metadata_json != null && typeof p.metadata_json === "object" && !Array.isArray(p.metadata_json)
        ? (p.metadata_json as Record<string, unknown>)
        : null,
    min_pick_quantity: p.min_pick_quantity != null ? Number(p.min_pick_quantity) : null,
    max_pick_quantity: p.max_pick_quantity != null ? Number(p.max_pick_quantity) : null,
    min_reserve_quantity: p.min_reserve_quantity != null ? Number(p.min_reserve_quantity) : null,
    max_reserve_quantity: p.max_reserve_quantity != null ? Number(p.max_reserve_quantity) : null,
    enable_stock_alert: Boolean(p.enable_stock_alert),
    min_total_stock: p.min_total_stock != null ? Number(p.min_total_stock) : null,
    bulk_ean: p.bulk_ean != null && String(p.bulk_ean).trim() !== "" ? String(p.bulk_ean).trim() : null,
    units_per_carton: p.units_per_carton != null ? Number(p.units_per_carton) : null,
    carton_length_cm: p.carton_length_cm != null ? Number(p.carton_length_cm) : null,
    carton_width_cm: p.carton_width_cm != null ? Number(p.carton_width_cm) : null,
    carton_height_cm: p.carton_height_cm != null ? Number(p.carton_height_cm) : null,
    carton_weight_kg: p.carton_weight_kg != null ? Number(p.carton_weight_kg) : null,
    carton_volume_dm3: p.carton_volume_dm3 != null ? Number(p.carton_volume_dm3) : null,
    product_orientation_type: p.product_orientation_type != null ? String(p.product_orientation_type) : null,
    product_shape_type: p.product_shape_type != null ? String(p.product_shape_type) : null,
    product_stack_compressible: p.product_stack_compressible != null ? Boolean(p.product_stack_compressible) : null,
    product_compressed_height_cm: p.product_compressed_height_cm != null ? Number(p.product_compressed_height_cm) : null,
    product_max_stack_weight: p.product_max_stack_weight != null ? Number(p.product_max_stack_weight) : null,
    product_stack_behavior: p.product_stack_behavior != null ? String(p.product_stack_behavior) : null,
    orientation_type: p.orientation_type != null ? String(p.orientation_type) : null,
    shape_type: p.shape_type != null ? String(p.shape_type) : null,
    stack_compressible: p.stack_compressible != null ? Boolean(p.stack_compressible) : null,
    compressed_height_cm: p.compressed_height_cm != null ? Number(p.compressed_height_cm) : null,
    max_stack_weight: p.max_stack_weight != null ? Number(p.max_stack_weight) : null,
    stack_behavior: p.stack_behavior != null ? String(p.stack_behavior) : null,
    carton_orientation_type: p.carton_orientation_type != null ? String(p.carton_orientation_type) : null,
    carton_shape_type: p.carton_shape_type != null ? String(p.carton_shape_type) : null,
    carton_stack_compressible: p.carton_stack_compressible != null ? Boolean(p.carton_stack_compressible) : null,
    carton_compressed_height_cm: p.carton_compressed_height_cm != null ? Number(p.carton_compressed_height_cm) : null,
    carton_max_stack_weight: p.carton_max_stack_weight != null ? Number(p.carton_max_stack_weight) : null,
    carton_stack_behavior: p.carton_stack_behavior != null ? String(p.carton_stack_behavior) : null,
    manufacturer_id: p.manufacturer_id != null ? Number(p.manufacturer_id) : null,
    manufacturer_brief:
      p.manufacturer_brief != null && typeof p.manufacturer_brief === "object"
        ? {
            id: Number((p.manufacturer_brief as { id: unknown }).id),
            name: String((p.manufacturer_brief as { name?: unknown }).name ?? ""),
            logo_url:
              typeof (p.manufacturer_brief as { logo_url?: unknown }).logo_url === "string"
                ? (p.manufacturer_brief as { logo_url: string }).logo_url
                : null,
          }
        : null,
    default_supplier_id: p.default_supplier_id != null ? Number(p.default_supplier_id) : null,
    default_supplier_brief:
      p.default_supplier_brief != null && typeof p.default_supplier_brief === "object"
        ? {
            id: Number((p.default_supplier_brief as { id: unknown }).id),
            name: String((p.default_supplier_brief as { name?: unknown }).name ?? ""),
          }
        : null,
    gpsr_responsible_name: typeof p.gpsr_responsible_name === "string" ? p.gpsr_responsible_name : null,
    gpsr_responsible_email: typeof p.gpsr_responsible_email === "string" ? p.gpsr_responsible_email : null,
    track_batch: Boolean(p.track_batch),
    track_expiry: Boolean(p.track_expiry),
    track_serial: Boolean(p.track_serial),
    require_recv_height: Boolean(p.require_recv_height),
    require_recv_width: Boolean(p.require_recv_width),
    require_recv_length: Boolean(p.require_recv_length),
    require_recv_weight: Boolean(p.require_recv_weight),
    require_recv_master_carton: Boolean(p.require_recv_master_carton),
    require_recv_master_carton_ean: Boolean(p.require_recv_master_carton_ean),
    require_recv_master_carton_qty: Boolean(p.require_recv_master_carton_qty),
    require_recv_master_carton_dims: Boolean(p.require_recv_master_carton_dims),
    require_recv_master_carton_weight: Boolean(p.require_recv_master_carton_weight),
  } as ProductListRow;
}
