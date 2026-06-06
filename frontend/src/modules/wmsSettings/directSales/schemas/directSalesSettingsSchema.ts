export type OrderStatusDefault = "new" | "paid" | "ready" | "completed";
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
  default_order_status: OrderStatusDefault;
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
  show_margin: boolean;
  show_stock: boolean;
  show_product_images: boolean;
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
  default_order_status: "paid",
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
  show_margin: false,
  show_stock: true,
  show_product_images: true,
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

export function normalizeDirectSalesSettings(raw: unknown): DirectSalesSettingsConfig {
  const d = (raw && typeof raw === "object" ? raw : {}) as Partial<DirectSalesSettingsConfig>;
  const pm = (d.payment_methods ?? {}) as Partial<DirectSalesPaymentMethods>;
  return {
    ...DEFAULT_DIRECT_SALES_SETTINGS,
    ...d,
    payment_methods: { ...DEFAULT_DIRECT_SALES_SETTINGS.payment_methods, ...pm },
    extensions: { ...DEFAULT_DIRECT_SALES_SETTINGS.extensions, ...(d.extensions ?? {}) },
  };
}
