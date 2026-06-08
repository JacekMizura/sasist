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

/** WMS execution paths */
export const wmsInventoryCountPaths = {
  root: "/wms/inventory-count",
  tasks: "/wms/inventory-count/tasks",
  task: (taskId: number | string) => `/wms/inventory-count/tasks/${taskId}`,
  count: (taskId: number | string) => `/wms/inventory-count/count/${taskId}`,
} as const;
