/** Authored Warehouse Routing Graph API (NEW SSOT — not legacy /warehouse-graph). */

import api from "./axios";

export type RoutingNode = {
  uuid: string;
  warehouse_id: number;
  layout_id?: number | null;
  x: number;
  y: number;
  node_type: string;
  operational_type?: string | null;
  label?: string | null;
  meta?: Record<string, unknown> | null;
};

export type RoutingEdge = {
  uuid: string;
  warehouse_id: number;
  layout_id?: number | null;
  from_node_uuid: string;
  to_node_uuid: string;
  distance_m: number;
  direction: string;
  enabled: boolean;
  allowed_processes: string[];
  allowed_transport_types: string[];
  cost_multiplier: number;
  label?: string | null;
  meta?: Record<string, unknown> | null;
};

export type RoutingAccessPoint = {
  uuid: string;
  warehouse_id: number;
  location_id: number;
  node_uuid: string;
  label?: string | null;
  meta?: Record<string, unknown> | null;
};

export type RoutingGraph = {
  warehouse_id: number;
  layout_id?: number | null;
  revision: number;
  nodes: RoutingNode[];
  edges: RoutingEdge[];
  access_points: RoutingAccessPoint[];
  configured: boolean;
};

export type RouteComputeResult = {
  ok: boolean;
  error_code?: string | null;
  message?: string | null;
  nodes: { node_uuid: string; x: number; y: number }[];
  path_segments: {
    edge_uuid: string;
    from_node_uuid: string;
    to_node_uuid: string;
    distance_m: number;
    cost: number;
  }[];
  distance_m?: number | null;
  cost?: number | null;
  hop_count: number;
};

export type RoutingValidationResult = {
  /** Structural validity only (no severity=error). Sketch save/draw allowed when true. */
  ok: boolean;
  /** Structure OK and ops config complete (start / packing / location access). */
  operational_ready?: boolean;
  issues: {
    code: string;
    severity: string;
    message: string;
    ref_uuid?: string | null;
    ref_uuids?: string[];
  }[];
};

export async function fetchRoutingGraph(warehouseId: number): Promise<RoutingGraph> {
  const { data } = await api.get<RoutingGraph>(`/warehouse-routing/${warehouseId}/graph`);
  return data;
}

export async function saveRoutingGraph(
  warehouseId: number,
  payload: {
    layout_id?: number | null;
    expected_revision?: number | null;
    nodes: Array<{
      uuid: string;
      x: number;
      y: number;
      node_type: string;
      operational_type?: string | null;
      label?: string | null;
      meta?: Record<string, unknown> | null;
    }>;
    edges: Array<{
      uuid: string;
      from_node_uuid: string;
      to_node_uuid: string;
      distance_m?: number | null;
      direction: string;
      enabled: boolean;
      allowed_processes: string[];
      allowed_transport_types: string[];
      cost_multiplier: number;
      label?: string | null;
      meta?: Record<string, unknown> | null;
    }>;
    access_points: Array<{
      uuid: string;
      location_id: number;
      node_uuid: string;
      label?: string | null;
      meta?: Record<string, unknown> | null;
    }>;
  }
): Promise<RoutingGraph> {
  const { data } = await api.put<RoutingGraph>(`/warehouse-routing/${warehouseId}/graph`, payload);
  return data;
}

export async function computeRoutingPath(
  warehouseId: number,
  body: {
    start_node_uuid: string;
    destination_node_uuid: string;
    process_type?: string | null;
    transport_type?: string | null;
  }
): Promise<RouteComputeResult> {
  const { data } = await api.post<RouteComputeResult>(`/warehouse-routing/${warehouseId}/route`, body);
  return data;
}

export async function validateRoutingGraph(warehouseId: number): Promise<RoutingValidationResult> {
  const { data } = await api.post<RoutingValidationResult>(`/warehouse-routing/${warehouseId}/validate`);
  return data;
}
