import api from "./axios";

export type RoutePathPoint = { x: number; y: number };

export type RoutePathRequest = {
  warehouseId: string;
  from: RoutePathPoint;
  to: RoutePathPoint;
};

export type RoutePathResponse = {
  points: RoutePathPoint[];
  distance: number | null;
  message?: string | null;
};

/** POST /route/path — real path between two points (cm) using warehouse graph. */
export async function fetchRoutePath(
  payload: RoutePathRequest
): Promise<RoutePathResponse> {
  const { data } = await api.post<RoutePathResponse>("/route/path/", payload);
  return data;
}
