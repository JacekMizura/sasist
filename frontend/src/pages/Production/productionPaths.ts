/** ERP production management (planners, supervisors). */
export const ERP_PRODUCTION_BASE = "/production";

export const erpProductionPaths = {
  home: ERP_PRODUCTION_BASE,
  recipes: `${ERP_PRODUCTION_BASE}/recipes`,
  recipe: (id: number | string) => `${ERP_PRODUCTION_BASE}/recipes/${id}`,
  batches: `${ERP_PRODUCTION_BASE}/batches`,
  batch: (id: number | string) => `${ERP_PRODUCTION_BASE}/batch/${id}`,
} as const;

/** WMS terminal — operator execution only (collect → produce → putaway). */
export const WMS_PRODUCTION_BASE = "/wms/production";

export const wmsProductionPaths = {
  home: WMS_PRODUCTION_BASE,
  collecting: (id?: number | string) =>
    id != null ? `${WMS_PRODUCTION_BASE}/collecting/${id}` : `${WMS_PRODUCTION_BASE}/collecting`,
  execute: (id?: number | string) =>
    id != null ? `${WMS_PRODUCTION_BASE}/execute/${id}` : `${WMS_PRODUCTION_BASE}/execute`,
  putaway: (id?: number | string) =>
    id != null ? `${WMS_PRODUCTION_BASE}/putaway/${id}` : `${WMS_PRODUCTION_BASE}/putaway`,
} as const;

/** @deprecated Use erpProductionPaths or wmsProductionPaths explicitly. */
export const productionPaths = erpProductionPaths;
