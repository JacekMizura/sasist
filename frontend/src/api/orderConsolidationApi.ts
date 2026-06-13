import api from "./axios";

export type ConsolidationPlanItemDto = {
  id: number;
  product_id: number;
  product_name?: string | null;
  quantity: number;
  source_warehouse_id: number;
  source_warehouse_name: string | null;
  target_warehouse_id: number;
  target_warehouse_name: string | null;
  status: string;
  stock_document_id: number | null;
};

export type ConsolidationPlanDto = {
  id: number;
  order_id: number;
  order_number?: string | null;
  target_warehouse_id: number;
  target_warehouse_name: string | null;
  status: string;
  created_at: string | null;
  transfers_received?: number;
  transfers_total?: number;
  progress_label?: string;
  pending_source_warehouses?: string[];
  items: ConsolidationPlanItemDto[];
};

export type GenerateConsolidationPlanResult = {
  outcome: string;
  message: string | null;
  plan_id: number | null;
  target_warehouse_id: number | null;
  target_warehouse_name: string | null;
  feasibility: Record<string, unknown> | null;
};

export type GenerateMmDraftsResult = {
  plan_id: number;
  documents_created: number;
  items_updated: number;
};

const PLAN_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Szkic",
  READY: "Gotowy",
  IN_PROGRESS: "W toku",
  COMPLETED: "Zakończony",
  CANCELLED: "Anulowany",
};

const ITEM_STATUS_LABELS: Record<string, string> = {
  WAITING: "Oczekuje",
  MM_CREATED: "MM utworzone",
  IN_TRANSIT: "W drodze",
  RECEIVED: "Przyjęte",
  CANCELLED: "Anulowane",
};

export function consolidationPlanStatusLabel(status: string): string {
  return PLAN_STATUS_LABELS[status.toUpperCase()] ?? status;
}

export function consolidationItemStatusLabel(status: string): string {
  return ITEM_STATUS_LABELS[status.toUpperCase()] ?? status;
}

export async function fetchOrderConsolidationPlan(orderId: number): Promise<ConsolidationPlanDto | null> {
  const { data } = await api.get<ConsolidationPlanDto | null>(`/orders/${orderId}/consolidation-plan`);
  return data;
}

export async function generateOrderConsolidationPlan(orderId: number): Promise<GenerateConsolidationPlanResult> {
  const { data } = await api.post<GenerateConsolidationPlanResult>(
    `/orders/${orderId}/generate-consolidation-plan`,
  );
  return data;
}

export async function generateConsolidationMmDrafts(planId: number): Promise<GenerateMmDraftsResult> {
  const { data } = await api.post<GenerateMmDraftsResult>(`/consolidation-plans/${planId}/generate-mm-drafts`);
  return data;
}
