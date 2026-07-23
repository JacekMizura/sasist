import { useCallback, useEffect, useState } from "react";
import {
  computeRoutingPath,
  fetchRoutingGraph,
  saveRoutingGraph,
  validateRoutingGraph,
  type RouteComputeResult,
  type RoutingAccessPoint,
  type RoutingEdge,
  type RoutingGraph,
  type RoutingNode,
  type RoutingValidationResult,
} from "../../../api/warehouseRoutingApi";

function newUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function physicalDistanceM(a: RoutingNode, b: RoutingNode): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy) / 100;
}

function detailMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const d = detail as { message?: string; code?: string };
    if (d.message) return d.message;
    if (d.code) return d.code;
  }
  return "Operacja na sieci tras nie powiodła się.";
}

export function useRoutingGraph(warehouseId: number | null, layoutId: number | null) {
  const [graph, setGraph] = useState<RoutingGraph | null>(null);
  const [revision, setRevision] = useState(1);
  const [nodes, setNodes] = useState<RoutingNode[]>([]);
  const [edges, setEdges] = useState<RoutingEdge[]>([]);
  const [accessPoints, setAccessPoints] = useState<RoutingAccessPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<RoutingValidationResult | null>(null);
  const [testResult, setTestResult] = useState<RouteComputeResult | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    setError(null);
    try {
      const g = await fetchRoutingGraph(warehouseId);
      setGraph(g);
      setRevision(g.revision ?? 1);
      setNodes(g.nodes ?? []);
      setEdges(g.edges ?? []);
      setAccessPoints(g.access_points ?? []);
      setDirty(false);
      setTestResult(null);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err?.message ?? "Nie udało się wczytać sieci tras.");
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (warehouseId == null) return null;
    setSaving(true);
    setError(null);
    try {
      const byUuid = new Map(nodes.map((n) => [n.uuid, n]));
      const g = await saveRoutingGraph(warehouseId, {
        layout_id: layoutId,
        expected_revision: revision,
        nodes: nodes.map((n) => ({
          uuid: n.uuid,
          x: n.x,
          y: n.y,
          node_type: n.node_type,
          operational_type: n.operational_type ?? null,
          label: n.label ?? null,
          meta: n.meta ?? null,
        })),
        edges: edges.map((e) => {
          const a = byUuid.get(e.from_node_uuid);
          const b = byUuid.get(e.to_node_uuid);
          return {
            uuid: e.uuid,
            from_node_uuid: e.from_node_uuid,
            to_node_uuid: e.to_node_uuid,
            // backend recomputes; send geometry-based hint only
            distance_m: a && b ? physicalDistanceM(a, b) : e.distance_m,
            direction: e.direction,
            enabled: e.enabled,
            allowed_processes: e.allowed_processes ?? [],
            allowed_transport_types: e.allowed_transport_types ?? [],
            cost_multiplier: e.cost_multiplier ?? 1,
            label: e.label ?? null,
            meta: e.meta ?? null,
          };
        }),
        access_points: accessPoints.map((a) => ({
          uuid: a.uuid,
          location_id: a.location_id,
          node_uuid: a.node_uuid,
          label: a.label ?? null,
          meta: a.meta ?? null,
        })),
      });
      setGraph(g);
      setRevision(g.revision ?? revision + 1);
      setNodes(g.nodes ?? []);
      setEdges(g.edges ?? []);
      setAccessPoints(g.access_points ?? []);
      setDirty(false);
      return g;
    } catch (e: unknown) {
      const err = e as {
        response?: { status?: number; data?: { detail?: unknown } };
        message?: string;
      };
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 409) {
        setError(
          detailMessage(detail) ||
            "Konfiguracja tras została zmieniona przez innego użytkownika. Odśwież dane i spróbuj ponownie."
        );
      } else {
        setError(detailMessage(detail) || err?.message || "Zapis sieci tras nie powiódł się.");
      }
      return null;
    } finally {
      setSaving(false);
    }
  }, [warehouseId, layoutId, nodes, edges, accessPoints, revision]);

  const addNodeAtCm = useCallback(
    (x: number, y: number, opts?: { operational_type?: string; label?: string }) => {
      const uuid = newUuid();
      const operational_type = opts?.operational_type ?? null;
      const node: RoutingNode = {
        uuid,
        warehouse_id: warehouseId ?? 0,
        layout_id: layoutId,
        x,
        y,
        node_type: operational_type ? "operational" : "junction",
        operational_type,
        label: opts?.label ?? "Punkt trasy",
      };
      setNodes((prev) => [...prev, node]);
      setDirty(true);
      return uuid;
    },
    [warehouseId, layoutId]
  );

  const updateNode = useCallback((uuid: string, patch: Partial<RoutingNode>) => {
    setNodes((prev) => {
      const next = prev.map((n) => (n.uuid === uuid ? { ...n, ...patch } : n));
      if (patch.x != null || patch.y != null) {
        const byUuid = new Map(next.map((n) => [n.uuid, n]));
        setEdges((eds) =>
          eds.map((e) => {
            if (e.from_node_uuid !== uuid && e.to_node_uuid !== uuid) return e;
            const a = byUuid.get(e.from_node_uuid);
            const b = byUuid.get(e.to_node_uuid);
            if (!a || !b) return e;
            return { ...e, distance_m: physicalDistanceM(a, b) };
          })
        );
      }
      return next;
    });
    setDirty(true);
  }, []);

  const removeNode = useCallback((uuid: string) => {
    setNodes((prev) => prev.filter((n) => n.uuid !== uuid));
    setEdges((prev) => prev.filter((e) => e.from_node_uuid !== uuid && e.to_node_uuid !== uuid));
    setAccessPoints((prev) => prev.filter((a) => a.node_uuid !== uuid));
    setDirty(true);
  }, []);

  const addEdge = useCallback(
    (fromUuid: string, toUuid: string) => {
      if (fromUuid === toUuid) return null;
      const exists = edges.some(
        (e) =>
          (e.from_node_uuid === fromUuid && e.to_node_uuid === toUuid) ||
          (e.from_node_uuid === toUuid && e.to_node_uuid === fromUuid)
      );
      if (exists) return null;
      const from = nodes.find((n) => n.uuid === fromUuid);
      const to = nodes.find((n) => n.uuid === toUuid);
      if (!from || !to) return null;
      const edge: RoutingEdge = {
        uuid: newUuid(),
        warehouse_id: warehouseId ?? 0,
        layout_id: layoutId,
        from_node_uuid: fromUuid,
        to_node_uuid: toUuid,
        distance_m: physicalDistanceM(from, to),
        direction: "BOTH",
        enabled: true,
        allowed_processes: [],
        allowed_transport_types: [],
        cost_multiplier: 1,
        label: "Odcinek trasy",
      };
      setEdges((prev) => [...prev, edge]);
      setDirty(true);
      return edge.uuid;
    },
    [edges, nodes, warehouseId, layoutId]
  );

  const updateEdge = useCallback((uuid: string, patch: Partial<RoutingEdge>) => {
    setEdges((prev) => prev.map((e) => (e.uuid === uuid ? { ...e, ...patch } : e)));
    setDirty(true);
  }, []);

  const removeEdge = useCallback((uuid: string) => {
    setEdges((prev) => prev.filter((e) => e.uuid !== uuid));
    setDirty(true);
  }, []);

  const upsertAccessPoint = useCallback(
    (locationId: number, nodeUuid: string, label?: string) => {
      setAccessPoints((prev) => {
        const existing = prev.find((a) => a.location_id === locationId && a.node_uuid === nodeUuid);
        if (existing) {
          return prev.map((a) =>
            a.uuid === existing.uuid ? { ...a, label: label ?? a.label } : a
          );
        }
        return [
          ...prev,
          {
            uuid: newUuid(),
            warehouse_id: warehouseId ?? 0,
            location_id: locationId,
            node_uuid: nodeUuid,
            label: label ?? "Dostęp do lokalizacji",
          },
        ];
      });
      setDirty(true);
    },
    [warehouseId]
  );

  const runValidate = useCallback(async () => {
    if (warehouseId == null) return;
    if (dirty) {
      const saved = await save();
      if (!saved) return;
    }
    const res = await validateRoutingGraph(warehouseId);
    setValidation(res);
    return res;
  }, [warehouseId, dirty, save]);

  const runTestRoute = useCallback(
    async (start: string, dest: string, processType?: string | null, transportType?: string | null) => {
      if (warehouseId == null) return null;
      if (dirty) {
        const saved = await save();
        if (!saved) return null;
      }
      const res = await computeRoutingPath(warehouseId, {
        start_node_uuid: start,
        destination_node_uuid: dest,
        process_type: processType,
        transport_type: transportType,
      });
      setTestResult(res);
      return res;
    },
    [warehouseId, dirty, save]
  );

  return {
    graph,
    revision,
    nodes,
    edges,
    accessPoints,
    loading,
    saving,
    error,
    dirty,
    validation,
    testResult,
    setTestResult,
    load,
    save,
    addNodeAtCm,
    updateNode,
    removeNode,
    addEdge,
    updateEdge,
    removeEdge,
    upsertAccessPoint,
    runValidate,
    runTestRoute,
  };
}
