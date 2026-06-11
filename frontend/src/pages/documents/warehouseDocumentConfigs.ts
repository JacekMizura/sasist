/**
 * Config-driven column sets per warehouse document type.
 * Shared layout — type-specific columns only.
 */

export const WAREHOUSE_DOC_TYPES = ["PZ", "Z_PZ", "PW", "RW", "WZ", "MM", "ZD", "ZW"] as const;
export type WarehouseDocType = (typeof WAREHOUSE_DOC_TYPES)[number];

export type WarehouseListColumnId =
  | "documentNumber"
  | "series"
  | "type"
  | "date"
  | "warehouse"
  | "operator"
  | "lineCount"
  | "totalQty"
  | "net"
  | "vat"
  | "gross"
  | "value"
  | "status"
  | "customer"
  | "supplier"
  | "sourceReason"
  | "mmFrom"
  | "mmTo"
  | "actions";

export type WarehouseDocumentListConfig = {
  type: WarehouseDocType;
  columns: WarehouseListColumnId[];
  valueField: "net" | "gross";
  showSupplierInDetail: boolean;
  showCustomerInDetail: boolean;
  showDocumentSource: boolean;
  financialDetail: "full" | "netOnly" | "none";
};

const COL = {
  documentNumber: "documentNumber",
  series: "series",
  type: "type",
  date: "date",
  warehouse: "warehouse",
  operator: "operator",
  lineCount: "lineCount",
  totalQty: "totalQty",
  net: "net",
  vat: "vat",
  gross: "gross",
  value: "value",
  status: "status",
  customer: "customer",
  supplier: "supplier",
  sourceReason: "sourceReason",
  mmFrom: "mmFrom",
  mmTo: "mmTo",
  actions: "actions",
} as const satisfies Record<WarehouseListColumnId, WarehouseListColumnId>;

const RECEIPT_FINANCE: WarehouseListColumnId[] = [
  COL.documentNumber,
  COL.series,
  COL.type,
  COL.date,
  COL.warehouse,
  COL.operator,
  COL.lineCount,
  COL.totalQty,
  COL.net,
  COL.vat,
  COL.gross,
  COL.status,
  COL.actions,
];

export const warehouseDocumentConfigs: Record<WarehouseDocType, WarehouseDocumentListConfig> = {
  PZ: {
    type: "PZ",
    columns: [...RECEIPT_FINANCE.slice(0, 6), COL.supplier, ...RECEIPT_FINANCE.slice(6)],
    valueField: "gross",
    showSupplierInDetail: true,
    showCustomerInDetail: false,
    showDocumentSource: true,
    financialDetail: "full",
  },
  Z_PZ: {
    type: "Z_PZ",
    columns: [
      COL.documentNumber,
      COL.status,
      COL.lineCount,
      COL.totalQty,
      COL.operator,
      COL.date,
      COL.actions,
    ],
    valueField: "net",
    showSupplierInDetail: false,
    showCustomerInDetail: false,
    showDocumentSource: false,
    financialDetail: "none",
  },
  PW: {
    type: "PW",
    columns: RECEIPT_FINANCE,
    valueField: "gross",
    showSupplierInDetail: false,
    showCustomerInDetail: false,
    showDocumentSource: true,
    financialDetail: "full",
  },
  RW: {
    type: "RW",
    columns: [
      COL.documentNumber,
      COL.series,
      COL.type,
      COL.date,
      COL.warehouse,
      COL.operator,
      COL.lineCount,
      COL.totalQty,
      COL.value,
      COL.status,
      COL.sourceReason,
      COL.actions,
    ],
    valueField: "net",
    showSupplierInDetail: false,
    showCustomerInDetail: false,
    showDocumentSource: true,
    financialDetail: "netOnly",
  },
  ZW: {
    type: "ZW",
    columns: [
      COL.documentNumber,
      COL.series,
      COL.type,
      COL.date,
      COL.warehouse,
      COL.operator,
      COL.lineCount,
      COL.totalQty,
      COL.value,
      COL.status,
      COL.sourceReason,
      COL.actions,
    ],
    valueField: "net",
    showSupplierInDetail: false,
    showCustomerInDetail: false,
    showDocumentSource: true,
    financialDetail: "netOnly",
  },
  WZ: {
    type: "WZ",
    columns: [
      COL.documentNumber,
      COL.customer,
      COL.date,
      COL.status,
      COL.lineCount,
      COL.totalQty,
      COL.value,
      COL.operator,
      COL.actions,
    ],
    valueField: "gross",
    showSupplierInDetail: false,
    showCustomerInDetail: true,
    showDocumentSource: false,
    financialDetail: "netOnly",
  },
  MM: {
    type: "MM",
    columns: [
      COL.documentNumber,
      COL.mmFrom,
      COL.mmTo,
      COL.totalQty,
      COL.status,
      COL.operator,
      COL.date,
      COL.actions,
    ],
    valueField: "net",
    showSupplierInDetail: false,
    showCustomerInDetail: false,
    showDocumentSource: false,
    financialDetail: "none",
  },
  ZD: {
    type: "ZD",
    columns: [
      COL.documentNumber,
      COL.series,
      COL.supplier,
      COL.date,
      COL.status,
      COL.lineCount,
      COL.totalQty,
      COL.sourceReason,
      COL.actions,
    ],
    valueField: "net",
    showSupplierInDetail: true,
    showCustomerInDetail: false,
    showDocumentSource: true,
    financialDetail: "none",
  },
};

export const WAREHOUSE_COLUMN_LABELS: Record<WarehouseListColumnId, string> = {
  documentNumber: "Nr dokumentu",
  series: "Seria",
  type: "Typ",
  date: "Data",
  warehouse: "Magazyn",
  operator: "Operator",
  lineCount: "Pozycji",
  totalQty: "Ilość łączna",
  net: "Netto",
  vat: "VAT",
  gross: "Brutto",
  value: "Wartość netto",
  status: "Status",
  customer: "Klient",
  supplier: "Dostawca",
  sourceReason: "Powód / źródło",
  mmFrom: "Magazyn źródłowy",
  mmTo: "Magazyn docelowy",
  actions: "Akcje",
};

export function normalizeWarehouseDocType(raw: string | undefined | null): WarehouseDocType {
  const u = String(raw ?? "PZ")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
  if (WAREHOUSE_DOC_TYPES.includes(u as WarehouseDocType)) return u as WarehouseDocType;
  if (u === "PM") return "MM";
  return "PZ";
}

export function getWarehouseDocumentConfig(type: string | undefined | null): WarehouseDocumentListConfig {
  return warehouseDocumentConfigs[normalizeWarehouseDocType(type)];
}
