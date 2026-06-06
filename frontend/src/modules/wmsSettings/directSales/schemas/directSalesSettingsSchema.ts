import type { OrderStatusOption } from "../../../../types/wmsPackingSettings";
import { resolveDirectSalesStatusId } from "../utils/resolveDirectSalesStatusId";

export type DocumentTypeDefault = "PA" | "FV";
export type AllocationStrategy = "auto" | "store_first" | "pick_face" | "manual";
export type PriceDisplayMode = "gross" | "net" | "both";

export type DirectSalesPaymentMethods = {
  cash: boolean;
  card: boolean;
  blik: boolean;
  transfer: boolean;
  mixed: boolean;
};

export type DirectSalesSettingsConfig = {
  enabled: boolean;
  default_order_status_id: number | null;
  session_created_order_status_id: number | null;
  paid_order_status_id: number | null;
  issued_order_status_id: number | null;
  cancelled_order_status_id: number | null;
  default_document_type: DocumentTypeDefault;
  auto_start_new_session: boolean;
  payment_methods: DirectSalesPaymentMethods;
  require_cash_received: boolean;
  show_change_amount: boolean;
  allow_incomplete_payment: boolean;
  allow_oversell: boolean;
  allocation_strategy: AllocationStrategy;
  hide_empty_locations: boolean;
  price_display: PriceDisplayMode;
  show_ean: boolean;
  show_sku: boolean;
  show_catalog_number: boolean;
  show_margin: boolean;
  show_stock: boolean;
  show_product_images: boolean;
  prefer_store_locations: boolean;
  allow_anonymous: boolean;
  require_customer_for_invoice: boolean;
  auto_save_customers: boolean;
  quick_create_customer: boolean;
  keyboard_shortcuts: boolean;
  scanner_mode: boolean;
  auto_focus_scan: boolean;
  terminal_sounds: boolean;
  zebra_tablet_mode: boolean;
  extensions: Record<string, unknown>;
};

export type DirectSalesSettingsRead = {
  tenant_id: number;
  warehouse_id: number;
  resolved: DirectSalesSettingsConfig;
  tenant_defaults: DirectSalesSettingsConfig;
  warehouse_overrides: DirectSalesSettingsConfig | null;
  has_warehouse_override: boolean;
};

export type DirectSalesSettingsSave = {
  tenant_id: number;
  warehouse_id: number;
  settings: DirectSalesSettingsConfig;
};

export type EditScope = "tenant" | "warehouse";

export const DEFAULT_DIRECT_SALES_SETTINGS: DirectSalesSettingsConfig = {
  enabled: false,
  default_order_status_id: null,
  session_created_order_status_id: null,
  paid_order_status_id: null,
  issued_order_status_id: null,
  cancelled_order_status_id: null,
  default_document_type: "PA",
  auto_start_new_session: true,
  payment_methods: { cash: true, card: true, blik: true, transfer: false, mixed: false },
  require_cash_received: true,
  show_change_amount: true,
  allow_incomplete_payment: false,
  allow_oversell: false,
  allocation_strategy: "store_first",
  hide_empty_locations: true,
  price_display: "gross",
  show_ean: true,
  show_sku: true,
  show_catalog_number: true,
  show_margin: false,
  show_stock: true,
  show_product_images: true,
  prefer_store_locations: true,
  allow_anonymous: true,
  require_customer_for_invoice: true,
  auto_save_customers: true,
  quick_create_customer: true,
  keyboard_shortcuts: true,
  scanner_mode: true,
  auto_focus_scan: true,
  terminal_sounds: true,
  zebra_tablet_mode: false,
  extensions: {},
};

function readOptionalStatusId(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function normalizeDirectSalesSettings(
  raw: unknown,
  statusOptions: OrderStatusOption[] = [],
): DirectSalesSettingsConfig {
  const d = (raw && typeof raw === "object" ? raw : {}) as Partial<DirectSalesSettingsConfig> & {
    default_order_status?: string;
  };
  const pm = (d.payment_methods ?? {}) as Partial<DirectSalesPaymentMethods>;
  const legacyDefault = typeof d.default_order_status === "string" ? d.default_order_status : null;
  const defaultOrderStatusId = resolveDirectSalesStatusId(
    readOptionalStatusId(d.default_order_status_id),
    statusOptions,
    legacyDefault ?? "paid",
  );
  const pick = (field: keyof DirectSalesSettingsConfig) =>
    resolveDirectSalesStatusId(readOptionalStatusId(d[field]), statusOptions);

  return {
    ...DEFAULT_DIRECT_SALES_SETTINGS,
    ...d,
    default_order_status_id: defaultOrderStatusId,
    session_created_order_status_id: pick("session_created_order_status_id"),
    paid_order_status_id: pick("paid_order_status_id"),
    issued_order_status_id: pick("issued_order_status_id"),
    cancelled_order_status_id: pick("cancelled_order_status_id"),
    payment_methods: { ...DEFAULT_DIRECT_SALES_SETTINGS.payment_methods, ...pm },
    extensions: { ...DEFAULT_DIRECT_SALES_SETTINGS.extensions, ...(d.extensions ?? {}) },
  };
}
