/** Canonical WMS production routes (operational module under /wms). */

export const PRODUCTION_BASE = "/wms/production";

export const productionPaths = {
  home: PRODUCTION_BASE,
  batch: (id: number | string) => `${PRODUCTION_BASE}/batch/${id}`,
  collecting: (id?: number | string) => (id != null ? `${PRODUCTION_BASE}/collecting/${id}` : `${PRODUCTION_BASE}/collecting`),
  execute: (id?: number | string) => (id != null ? `${PRODUCTION_BASE}/execute/${id}` : `${PRODUCTION_BASE}/execute`),
  putaway: (id?: number | string) => (id != null ? `${PRODUCTION_BASE}/putaway/${id}` : `${PRODUCTION_BASE}/putaway`),
} as const;
