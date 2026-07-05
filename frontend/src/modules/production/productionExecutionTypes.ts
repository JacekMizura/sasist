import type { ProductionExecutionJobRead, ProductionExecutionPhase } from "@/api/productionApi";
import type { CollectionJobHeaderRead, CollectionTaskRead } from "@/api/productionApi";

export type ProductionExecutionKind = "batch" | "order";

export type ProductionExecutionRef = {
  kind: ProductionExecutionKind;
  id: number;
};

export const PRODUCTION_KIND_LABEL: Record<ProductionExecutionKind, string> = {
  batch: "Partia",
  order: "MO",
};

export const EXECUTION_STATUS_LABEL: Record<string, string> = {
  draft: "Robocza",
  planned: "Zaplanowana",
  collecting: "Zbieranie",
  in_progress: "W realizacji",
  awaiting_putaway: "Oczekuje na rozlokowanie",
  putaway: "Oczekuje na rozlokowanie",
  completed: "Ukończona",
  cancelled: "Anulowana",
};

export type UnifiedCollectionState = {
  ref: ProductionExecutionRef;
  status: string;
  header: CollectionJobHeaderRead;
  tasks: CollectionTaskRead[];
  collectedCount: number;
  totalCount: number;
  progressPercent: number;
};

export type UnifiedExecutionLine = {
  lineKey: string;
  lineId?: number;
  productName: string;
  productImageUrl?: string | null;
  productSku?: string | null;
  plannedQuantity: number;
  completedQuantity: number;
};

export type UnifiedExecutionDetail = {
  ref: ProductionExecutionRef;
  number: string;
  productLabel: string;
  warehouseId: number;
  lines: UnifiedExecutionLine[];
};

export type UnifiedPutawayLine = {
  lineKey: string;
  lineId?: number;
  productName: string;
  quantity: number;
  targetLocationId?: number | null;
  targetLocationName?: string | null;
};

export type UnifiedPutawayDetail = {
  ref: ProductionExecutionRef;
  number: string;
  warehouseId: number;
  lines: UnifiedPutawayLine[];
};

export function jobRef(job: ProductionExecutionJobRead): ProductionExecutionRef {
  return { kind: job.kind, id: job.id };
}

export function refKey(ref: ProductionExecutionRef): string {
  return `${ref.kind}-${ref.id}`;
}

export function parseWmsProductionRouteParams(params: {
  kind?: string;
  id?: string;
  batchId?: string;
}): ProductionExecutionRef | null {
  const kind = params.kind?.toLowerCase();
  if (kind === "batch" || kind === "order") {
    const id = Number(params.id);
    if (Number.isFinite(id) && id > 0) return { kind, id };
    return null;
  }
  if (params.batchId) {
    const id = Number(params.batchId);
    if (Number.isFinite(id) && id > 0) return { kind: "batch", id };
  }
  return null;
}

export function isCollectingQueueBlocked(job: ProductionExecutionJobRead): boolean {
  return job.status === "planned" && Boolean(job.has_shortages);
}

export type { ProductionExecutionPhase };
