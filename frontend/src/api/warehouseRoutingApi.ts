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

export type LocationAccessBinding = {
  uuid: string;
  warehouse_id: number;
  location_id: number;
  binding_mode: string;
  status: string;
  edge_uuid?: string | null;
  t?: number | null;
  service_point_x_cm?: number | null;
  service_point_y_cm?: number | null;
  entry_x_cm?: number | null;
  entry_y_cm?: number | null;
  access_approach_m?: number | null;
  rack_id?: number | null;
  rack_uuid?: string | null;
  legacy_node_uuid?: string | null;
  graph_revision?: number | null;
};

export type LocationAccessSummary = {
  warehouse_id: number;
  total: number;
  by_status: Record<string, number>;
  by_mode: Record<string, number>;
};

export async function fetchLocationAccess(warehouseId: number): Promise<LocationAccessBinding[]> {
  const { data } = await api.get<LocationAccessBinding[]>(
    `/warehouse-routing/${warehouseId}/location-access`
  );
  return data;
}

export async function fetchLocationAccessSummary(warehouseId: number): Promise<LocationAccessSummary> {
  const { data } = await api.get<LocationAccessSummary>(
    `/warehouse-routing/${warehouseId}/location-access/summary`
  );
  return data;
}

export async function recomputeLocationAccess(warehouseId: number): Promise<{
  warehouse_id: number;
  locations_total: number;
  graph_revision: number;
  layout_fingerprint: string;
  counts: Record<string, number>;
}> {
  const { data } = await api.post(`/warehouse-routing/${warehouseId}/location-access/recompute`);
  return data;
}

export async function restoreLocationAccessAuto(
  warehouseId: number,
  locationId: number
): Promise<LocationAccessBinding> {
  const { data } = await api.post<LocationAccessBinding>(
    `/warehouse-routing/${warehouseId}/location-access/${locationId}/restore-auto`
  );
  return data;
}

export async function overrideLocationAccess(
  warehouseId: number,
  locationId: number,
  body: { edge_uuid?: string; t?: number; node_uuid?: string }
): Promise<LocationAccessBinding> {
  const { data } = await api.post<LocationAccessBinding>(
    `/warehouse-routing/${warehouseId}/location-access/${locationId}/override`,
    body
  );
  return data;
}
