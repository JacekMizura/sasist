/** ERP production management (planners, supervisors). */
export const ERP_PRODUCTION_BASE = "/production";

export const erpProductionPaths = {
  home: ERP_PRODUCTION_BASE,
  recipes: `${ERP_PRODUCTION_BASE}/recipes`,
  recipe: (id: number | string) => `${ERP_PRODUCTION_BASE}/recipes/${id}`,
  orders: `${ERP_PRODUCTION_BASE}/orders`,
  order: (id: number | string) => `${ERP_PRODUCTION_BASE}/orders/${id}`,
  planning: `${ERP_PRODUCTION_BASE}/planning`,
  history: `${ERP_PRODUCTION_BASE}/history`,
  analytics: `${ERP_PRODUCTION_BASE}/analytics`,
  /** @deprecated Use planning or orders */
  batches: `${ERP_PRODUCTION_BASE}/planning`,
  batch: (id: number | string) => `${ERP_PRODUCTION_BASE}/batch/${id}`,
  erpExecution: (kind: "batch" | "order", id: number | string) =>
    `${ERP_PRODUCTION_BASE}/erp/${kind}/${id}`,
  /** @deprecated use erpExecution */
  paperExecution: (kind: "batch" | "order", id: number | string) =>
    `${ERP_PRODUCTION_BASE}/erp/${kind}/${id}`,
  materialReservations: `${ERP_PRODUCTION_BASE}/material-reservations`,
  shortages: `${ERP_PRODUCTION_BASE}/shortages`,
  materialAnalysis: `${ERP_PRODUCTION_BASE}/material-analysis`,
  materialSubstitutes: `${ERP_PRODUCTION_BASE}/material-substitutes`,
} as const;

/** WMS terminal — operator execution only (collect → produce → standard putaway). */
export const WMS_PRODUCTION_BASE = "/wms/production";

export type WmsProductionJobKind = "batch" | "order";

type WmsPhase = "collecting" | "execute" | "putaway";

function wmsJobPath(
  phase: WmsPhase,
  kindOrId?: WmsProductionJobKind | number | string,
  id?: number | string,
): string {
  if (kindOrId === "batch" || kindOrId === "order") {
    return id != null ? `${WMS_PRODUCTION_BASE}/${phase}/${kindOrId}/${id}` : `${WMS_PRODUCTION_BASE}/${phase}`;
  }
  if (kindOrId != null) {
    return `${WMS_PRODUCTION_BASE}/${phase}/batch/${kindOrId}`;
  }
  return `${WMS_PRODUCTION_BASE}/${phase}`;
}

export const wmsProductionPaths = {
  home: WMS_PRODUCTION_BASE,
  collecting: (kindOrId?: WmsProductionJobKind | number | string, id?: number | string) =>
    wmsJobPath("collecting", kindOrId, id),
  execute: (kindOrId?: WmsProductionJobKind | number | string, id?: number | string) =>
    wmsJobPath("execute", kindOrId, id),
  putaway: (kindOrId?: WmsProductionJobKind | number | string, id?: number | string) =>
    wmsJobPath("putaway", kindOrId, id),
  /** @deprecated Use putaway() for production WMS queue; PW execution uses /wms/putaway/:id */
  putawayLegacy: () => "/wms/putaway",
  /** Canonical job URL for any phase. */
  job: (phase: WmsPhase, kind: WmsProductionJobKind, id: number | string) =>
    `${WMS_PRODUCTION_BASE}/${phase}/${kind}/${id}`,
} as const;

/** @deprecated Use erpProductionPaths or wmsProductionPaths explicitly. */
export const productionPaths = erpProductionPaths;
