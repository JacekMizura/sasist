import api from "./axios";

export type FulfillmentAssignmentPhase =
  | "UNASSIGNED"
  | "FULFILLMENT_ASSIGNED"
  | "CONSOLIDATION_REQUIRED"
  | "CONSOLIDATING"
  | "WAVE_CREATED"
  | "PICKING"
  | "PACKING"
  | "SHIPPED";

export type AssignOrderWarehousePayload = {
  warehouse_id: number;
  reason: string;
};

export async function assignOrderFulfillmentWarehouse(
  orderId: number,
  payload: AssignOrderWarehousePayload,
): Promise<void> {
  await api.post(`/orders/${orderId}/assign-warehouse`, payload);
}

export const FULFILLMENT_PHASE_LABELS: Record<FulfillmentAssignmentPhase, string> = {
  UNASSIGNED: "Nieprzypisane",
  FULFILLMENT_ASSIGNED: "Przypisane",
  CONSOLIDATION_REQUIRED: "Konsolidacja wymagana",
  CONSOLIDATING: "Konsolidacja w toku",
  WAVE_CREATED: "Fala",
  PICKING: "Kompletacja",
  PACKING: "Pakowanie",
  SHIPPED: "Wysłane",
};

export const FULFILLMENT_PHASE_BADGE_CLASS: Record<FulfillmentAssignmentPhase, string> = {
  UNASSIGNED: "border-amber-200 bg-amber-50 text-amber-900",
  FULFILLMENT_ASSIGNED: "border-cyan-200 bg-cyan-50 text-cyan-900",
  CONSOLIDATION_REQUIRED: "border-orange-200 bg-orange-50 text-orange-900",
  CONSOLIDATING: "border-orange-300 bg-orange-100 text-orange-950",
  WAVE_CREATED: "border-violet-200 bg-violet-50 text-violet-900",
  PICKING: "border-blue-200 bg-blue-50 text-blue-900",
  PACKING: "border-indigo-200 bg-indigo-50 text-indigo-900",
  SHIPPED: "border-slate-200 bg-slate-100 text-slate-700",
};
