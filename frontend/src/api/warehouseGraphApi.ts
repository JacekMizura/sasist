import api from "./axios";

export type WarehouseGraphNode = {
  id: number;
  warehouse_id: number;
  x: number;
  y: number;
  type: string;
  locations_count?: number;
  location_ids?: number[];
};

export type WarehouseGraphEdge = {
  id: number;
  warehouse_id: number;
  node_from_id: number;
  node_to_id: number;
  distance_m: number;
};

export type WarehouseLocationItem = {
  id: number;
  name: string;
  x: number | null;
  y: number | null;
};

export async function getWarehouseGraphNodes(
  warehouseId: number
): Promise<WarehouseGraphNode[]> {
  const { data } = await api.get<WarehouseGraphNode[]>(
    `/warehouse-graph/${warehouseId}/nodes`
  );
  return Array.isArray(data) ? data : [];
}

export async function getWarehouseGraphEdges(
  warehouseId: number
): Promise<WarehouseGraphEdge[]> {
  const { data } = await api.get<WarehouseGraphEdge[]>(
    `/warehouse-graph/${warehouseId}/edges`
  );
  return Array.isArray(data) ? data : [];
}

export async function getWarehouseLocations(
  warehouseId: number
): Promise<WarehouseLocationItem[]> {
  const { data } = await api.get<WarehouseLocationItem[]>(
    `/warehouses/${warehouseId}/locations`
  );
  return Array.isArray(data) ? data : [];
}
