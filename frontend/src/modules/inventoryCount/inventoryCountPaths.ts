/** ERP inventory count module paths */
export const erpInventoryCountPaths = {
  root: "/inventory-count",
  dashboard: "/inventory-count/dashboard",
  documents: "/inventory-count/documents",
  wizard: "/inventory-count/wizard",
  wizardDoc: (id: number | string) => `/inventory-count/wizard/${id}`,
  document: (id: number | string) => `/inventory-count/documents/${id}`,
  reports: "/inventory-count/reports",
} as const;

/** WMS execution paths — document-scoped operator flow */
export const wmsInventoryCountPaths = {
  root: "/wms/inventory-count",
  document: (documentId: number | string) => `/wms/inventory-count/d/${documentId}`,
  count: (documentId: number | string, taskId: number | string) =>
    `/wms/inventory-count/d/${documentId}/count/${taskId}`,
  /** @deprecated use count(documentId, taskId) — kept for legacy redirects */
  countLegacy: (taskId: number | string) => `/wms/inventory-count/count/${taskId}`,
} as const;
