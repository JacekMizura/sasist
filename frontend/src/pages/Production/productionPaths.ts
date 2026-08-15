/** ERP production management (planners, supervisors). */
export const ERP_PRODUCTION_BASE = "/produkcja";

export const erpProductionPaths = {
  home: ERP_PRODUCTION_BASE,
  recipes: `${ERP_PRODUCTION_BASE}/receptury`,
  recipe: (id: number | string) => `${ERP_PRODUCTION_BASE}/receptury/${id}`,
  orders: `${ERP_PRODUCTION_BASE}/zlecenia`,
  order: (id: number | string) => `${ERP_PRODUCTION_BASE}/zlecenia/${id}`,
  /** Kreator pojedynczego zlecenia / partii (UX create). */
  createOrder: `${ERP_PRODUCTION_BASE}/zlecenia/new`,
  planning: `${ERP_PRODUCTION_BASE}/planowanie`,
  history: `${ERP_PRODUCTION_BASE}/historia`,
  analytics: `${ERP_PRODUCTION_BASE}/analiza-kosztow`,
  /** @deprecated Use planning or orders */
  batches: `${ERP_PRODUCTION_BASE}/planowanie`,
  batch: (id: number | string) => `${ERP_PRODUCTION_BASE}/serie/${id}`,
  erpExecution: (kind: "batch" | "order", id: number | string) =>
    `${ERP_PRODUCTION_BASE}/realizacja/${kind}/${id}`,
  /** @deprecated use erpExecution */
  paperExecution: (kind: "batch" | "order", id: number | string) =>
    `${ERP_PRODUCTION_BASE}/realizacja/${kind}/${id}`,
  /** Hub „Materiały” — braki / rezerwacje / analiza jako podwidoki. */
  materials: `${ERP_PRODUCTION_BASE}/materialy`,
  materialsShortages: `${ERP_PRODUCTION_BASE}/materialy/braki`,
  materialsReservations: `${ERP_PRODUCTION_BASE}/materialy/rezerwacje`,
  materialsAnalysis: `${ERP_PRODUCTION_BASE}/materialy/analiza`,
  /** @deprecated Use materialsReservations */
  materialReservations: `${ERP_PRODUCTION_BASE}/materialy/rezerwacje`,
  /** @deprecated Use materialsShortages */
  shortages: `${ERP_PRODUCTION_BASE}/materialy/braki`,
  /** @deprecated Use materialsAnalysis */
  materialAnalysis: `${ERP_PRODUCTION_BASE}/materialy/analiza`,
  materialSubstitutes: `${ERP_PRODUCTION_BASE}/zastepniki-materialow`,
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
