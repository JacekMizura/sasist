export type ReturnDamageClassDto = {
  code: string;
  label: string;
  color_hex: string;
  description: string | null;
  warehouse_behavior: string | null;
  resale_allowed: boolean;
  visible_wms: boolean;
  sort_order: number;
  is_active: boolean;
};

export type ReturnDamageReasonDto = {
  class_code: string;
  code: string;
  label: string;
  visible_wms: boolean;
  sort_order: number;
  is_active: boolean;
};

export type ReturnProductDecisionDto = {
  category: "ACCEPTED" | "REJECTED";
  code: string;
  label: string;
  visible_wms: boolean;
  sort_order: number;
  is_active: boolean;
  /** Dotyczy REJECTED: czy przy zamknięciu RMZ utworzyć PZ_RT (towar fizycznie na magazynie). */
  creates_stock_document?: boolean;
};

export type ReturnCustomerReturnTypeDto = {
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

export type ReturnOrderSourceDto = {
  code: string;
  label: string;
  logo_url?: string | null;
  sort_order: number;
  is_active: boolean;
};

/** Szerokość bloku w widoku szczegółów — konfigurator + zapis w `layout_json`. */
export type ReturnDetailSectionWidth = "full" | "sidebar" | "compact";

export type ReturnDetailLayoutDto = {
  left_column: string[];
  right_column: string[];
  section_widths?: Partial<Record<string, ReturnDetailSectionWidth>>;
};

export type ReturnModuleConfigDto = {
  damage_classes: ReturnDamageClassDto[];
  damage_reasons: ReturnDamageReasonDto[];
  product_decisions: ReturnProductDecisionDto[];
  customer_return_types: ReturnCustomerReturnTypeDto[];
  order_sources: ReturnOrderSourceDto[];
  detail_layout: ReturnDetailLayoutDto;
};

export type WmsReturnModuleConfigDto = Pick<
  ReturnModuleConfigDto,
  "damage_classes" | "damage_reasons" | "product_decisions" | "detail_layout"
>;
