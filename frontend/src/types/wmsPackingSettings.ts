export type WmsPackingAutoActions = {
  create_document: boolean;
  generate_shipment: boolean;
  print_document: boolean;
  print_label: boolean;
  change_order_status: boolean;
};

export type WmsPackingDocumentSettings = {
  /** Legacy — backend przy tworzeniu dokumentu nie używa; zapis pakowania zeruje pole. */
  series_id?: string | null;
  invoice_series_id: string | null;
  receipt_series_id: string | null;
};

export type WmsPackingFallbackLabel = {
  template_id: number | null;
  delay_seconds: number;
};

/** Settings → WMS → Pakowanie → „Wygląd i interfejs” — widoczność pól na ekranie pakowania. */
export type WmsPackingInterfaceDisplay = {
  show_stock: boolean;
  show_ean: boolean;
  show_symbol: boolean;
  show_catalog_number: boolean;
};

export const DEFAULT_WMS_PACKING_INTERFACE_DISPLAY: WmsPackingInterfaceDisplay = {
  show_stock: true,
  show_ean: true,
  show_symbol: true,
  show_catalog_number: true,
};

export const DEFAULT_WMS_PACKING_AUTO_ACTIONS: WmsPackingAutoActions = {
  create_document: false,
  generate_shipment: false,
  print_document: false,
  print_label: false,
  change_order_status: false,
};

export function createDefaultWmsPackingSettingsRead(tenantId: number, warehouseId: number): WmsPackingSettingsRead {
  return {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    start_status_id: null,
    packed_status_id: null,
    missing_status_id: null,
    packing_after_finish_action: "STAY",
    auto_actions: { ...DEFAULT_WMS_PACKING_AUTO_ACTIONS },
    document_settings: {
      series_id: null,
      invoice_series_id: null,
      receipt_series_id: null,
    },
    fallback_label: { template_id: null, delay_seconds: 0 },
    interface_display: { ...DEFAULT_WMS_PACKING_INTERFACE_DISPLAY },
  };
}

/** Uzupełnia brakujące pola (np. stary cache, częściowy JSON) — bezpieczne dla UI. */
export function normalizeWmsPackingSettingsRead(
  tenantId: number,
  warehouseId: number,
  raw: Partial<WmsPackingSettingsRead> | null | undefined,
): WmsPackingSettingsRead {
  const d = createDefaultWmsPackingSettingsRead(tenantId, warehouseId);
  if (!raw || typeof raw !== "object") return d;
  const pfa = raw.packing_after_finish_action;
  const packing_after_finish_action: WmsPackingAfterFinishAction =
    pfa === "GO_TO_LIST" || pfa === "STAY" ? pfa : d.packing_after_finish_action;
  const delayRaw = raw.fallback_label?.delay_seconds;
  const delay_seconds =
    typeof delayRaw === "number" && Number.isFinite(delayRaw) ? Math.max(0, Math.floor(delayRaw)) : d.fallback_label.delay_seconds;
  const tid = raw.fallback_label?.template_id;
  const template_id =
    tid === null || tid === undefined ? d.fallback_label.template_id : Number.isFinite(Number(tid)) ? Number(tid) : d.fallback_label.template_id;
  return {
    ...d,
    ...raw,
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    packing_after_finish_action,
    auto_actions: { ...d.auto_actions, ...(raw.auto_actions ?? {}) },
    document_settings: {
      ...d.document_settings,
      ...(raw.document_settings ?? {}),
      invoice_series_id: raw.document_settings?.invoice_series_id ?? d.document_settings.invoice_series_id,
      receipt_series_id: raw.document_settings?.receipt_series_id ?? d.document_settings.receipt_series_id,
    },
    fallback_label: {
      ...d.fallback_label,
      ...(raw.fallback_label ?? {}),
      template_id,
      delay_seconds,
    },
    interface_display: {
      ...d.interface_display,
      ...(raw.interface_display ?? {}),
    },
  };
}

const WMS_PACKING_API_CACHE_KEY = (warehouseId: number) => `wms-packing-api-settings:v1:${warehouseId}`;

export function loadCachedWmsPackingSettingsRead(tenantId: number, warehouseId: number): WmsPackingSettingsRead | null {
  try {
    const raw = localStorage.getItem(WMS_PACKING_API_CACHE_KEY(warehouseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WmsPackingSettingsRead>;
    return normalizeWmsPackingSettingsRead(tenantId, warehouseId, parsed);
  } catch {
    return null;
  }
}

export function saveCachedWmsPackingSettingsRead(warehouseId: number, data: WmsPackingSettingsRead): void {
  try {
    localStorage.setItem(WMS_PACKING_API_CACHE_KEY(warehouseId), JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export type WmsPackingAfterFinishAction = "STAY" | "GO_TO_LIST";

export type WmsPackingSettingsRead = {
  tenant_id: number;
  warehouse_id: number;
  start_status_id: number | null;
  packed_status_id: number | null;
  missing_status_id: number | null;
  packing_after_finish_action: WmsPackingAfterFinishAction;
  auto_actions: WmsPackingAutoActions;
  document_settings: WmsPackingDocumentSettings;
  fallback_label: WmsPackingFallbackLabel;
  interface_display: WmsPackingInterfaceDisplay;
};

export type WmsPackingSettingsSave = Omit<WmsPackingSettingsRead, "tenant_id" | "warehouse_id" | "interface_display"> & {
  tenant_id: number;
  warehouse_id?: number | null;
  /** Pominięte w PATCH → backend zostawia poprzedni JSON. */
  interface_display?: WmsPackingInterfaceDisplay;
};

export type OrderStatusOption = {
  id: number;
  name: string;
  main_group: string;
  subgroup_name?: string | null;
  group_display_name?: string | null;
};
