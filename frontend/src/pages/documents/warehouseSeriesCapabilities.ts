import type { DocumentSeriesSubtype } from "../../api/documentSeriesApi";

export type WarehouseSeriesCapabilities = {
  subtype: DocumentSeriesSubtype;
  label_pl: string;
  operational_code: string;
  physical_effect: boolean;
  show_collective_return_receipt: boolean;
  show_delete_mode: boolean;
  show_email_notification: boolean;
  show_print_template_preset: boolean;
  show_document_template: boolean;
  show_order_status_hooks: boolean;
  show_company_block: boolean;
  default_print_template_id: number | null;
  document_template_kind: string | null;
};

/** FE mirror of backend/services/warehouse_series_capabilities.py — keep in sync. */
export const WAREHOUSE_SERIES_CAPABILITIES: Record<string, WarehouseSeriesCapabilities> = {
  WZ: {
    subtype: "WZ",
    label_pl: "WZ — Wydanie zewnętrzne",
    operational_code: "WZ",
    physical_effect: true,
    show_collective_return_receipt: false,
    show_delete_mode: true,
    show_email_notification: false,
    show_print_template_preset: true,
    show_document_template: true,
    show_order_status_hooks: false,
    show_company_block: false,
    default_print_template_id: 3,
    document_template_kind: "wz",
  },
  PZ: {
    subtype: "PZ",
    label_pl: "PZ — Przyjęcie zewnętrzne",
    operational_code: "PZ",
    physical_effect: true,
    show_collective_return_receipt: false,
    show_delete_mode: true,
    show_email_notification: false,
    show_print_template_preset: false,
    show_document_template: true,
    show_order_status_hooks: false,
    show_company_block: false,
    default_print_template_id: null,
    document_template_kind: "pz",
  },
  Z_PZ: {
    subtype: "Z_PZ",
    label_pl: "Z_PZ — Przyjęcie zwrotne",
    operational_code: "Z-PZ",
    physical_effect: true,
    show_collective_return_receipt: true,
    show_delete_mode: true,
    show_email_notification: false,
    show_print_template_preset: false,
    show_document_template: true,
    show_order_status_hooks: false,
    show_company_block: false,
    default_print_template_id: null,
    document_template_kind: "pz",
  },
  RW: {
    subtype: "RW",
    label_pl: "RW — Rozchód wewnętrzny",
    operational_code: "RW",
    physical_effect: true,
    show_collective_return_receipt: false,
    show_delete_mode: true,
    show_email_notification: false,
    show_print_template_preset: false,
    show_document_template: true,
    show_order_status_hooks: false,
    show_company_block: false,
    default_print_template_id: null,
    document_template_kind: "rw",
  },
  PW: {
    subtype: "PW",
    label_pl: "PW — Przyjęcie wewnętrzne",
    operational_code: "PW",
    physical_effect: true,
    show_collective_return_receipt: false,
    show_delete_mode: true,
    show_email_notification: false,
    show_print_template_preset: false,
    show_document_template: true,
    show_order_status_hooks: false,
    show_company_block: false,
    default_print_template_id: null,
    document_template_kind: "pw",
  },
  MM: {
    subtype: "MM",
    label_pl: "MM — Przesunięcie magazynowe",
    operational_code: "MM",
    physical_effect: true,
    show_collective_return_receipt: false,
    show_delete_mode: true,
    show_email_notification: false,
    show_print_template_preset: false,
    show_document_template: true,
    show_order_status_hooks: false,
    show_company_block: false,
    default_print_template_id: null,
    document_template_kind: "mm",
  },
  RESERVATION: {
    subtype: "RESERVATION",
    label_pl: "RZ — Rezerwacja",
    operational_code: "RZ",
    physical_effect: false,
    show_collective_return_receipt: false,
    show_delete_mode: true,
    show_email_notification: false,
    show_print_template_preset: false,
    show_document_template: false,
    show_order_status_hooks: false,
    show_company_block: false,
    default_print_template_id: null,
    document_template_kind: null,
  },
};

export const SUPPORTED_WAREHOUSE_SUBTYPES = Object.keys(WAREHOUSE_SERIES_CAPABILITIES) as DocumentSeriesSubtype[];

export function warehouseCapabilitiesFor(subtype: string): WarehouseSeriesCapabilities | null {
  return WAREHOUSE_SERIES_CAPABILITIES[String(subtype || "").trim().toUpperCase()] ?? null;
}

export function physicalEffectForWarehouseSubtype(subtype: string): boolean {
  return warehouseCapabilitiesFor(subtype)?.physical_effect ?? true;
}

/** Clear subtype-incompatible warehouse settings when subtype changes. */
export function applyWarehouseSubtypeDefaults(
  draft: Record<string, unknown>,
  subtype: DocumentSeriesSubtype,
): Record<string, unknown> {
  const cap = warehouseCapabilitiesFor(subtype);
  if (!cap) return draft;
  const next = { ...draft, subtype, warehouse_effect: cap.physical_effect };
  if (!cap.show_collective_return_receipt) next.collective_return_receipt = false;
  if (!cap.show_print_template_preset) {
    next.print_template_id = null;
    next.print_template = "";
  } else if (next.print_template_id == null && !(next.print_template as string)?.trim()) {
    next.print_template_id = cap.default_print_template_id;
  }
  if (!cap.show_document_template) {
    next.document_template_version_id = null;
    next.document_template_variant_code = null;
  }
  return next;
}
