import { useMemo, useState } from "react";
import type { RoutingEdge, RoutingNode } from "../../../api/warehouseRoutingApi";
import {
  ROUTING_OP_OPTIONS,
  ROUTING_PROCESS_OPTIONS,
  ROUTING_TRANSPORT_OPTIONS,
  type RoutingTool,
} from "./routingLabels";
import type { useRoutingGraph } from "./useRoutingGraph";

type Hook = ReturnType<typeof useRoutingGraph>;

type Props = {
  routing: Hook;
  tool: RoutingTool;
  setTool: (t: RoutingTool) => void;
  selectedNodeUuid: string | null;
  selectedEdgeUuid: string | null;
  setSelectedNodeUuid: (u: string | null) => void;
  setSelectedEdgeUuid: (u: string | null) => void;
  testStartUuid: string | null;
  testDestUuid: string | null;
  setTestStartUuid: (u: string | null) => void;
  setTestDestUuid: (u: string | null) => void;
  locations: { id: number; name: string }[];
};

export function RoutingRoutesPanel({
  routing,
  tool,
  setTool,
  selectedNodeUuid,
  selectedEdgeUuid,
  setSelectedNodeUuid,
  setSelectedEdgeUuid,
  testStartUuid,
  testDestUuid,
  setTestStartUuid,
  setTestDestUuid,
  locations,
}: Props) {
  const [processType, setProcessType] = useState<string>("");
  const [transportType, setTransportType] = useState<string>("");
  const [apLocationId, setApLocationId] = useState<string>("");

  const selectedNode: RoutingNode | null = useMemo(
    () => routing.nodes.find((n) => n.uuid === selectedNodeUuid) ?? null,
    [routing.nodes, selectedNodeUuid]
  );
  const selectedEdge: RoutingEdge | null = useMemo(
    () => routing.edges.find((e) => e.uuid === selectedEdgeUuid) ?? null,
    [routing.edges, selectedEdgeUuid]
  );

  return (
    <aside className="flex h-full min-h-0 w-[320px] shrink-0 flex-col gap-3 overflow-auto border-l border-slate-200 bg-white p-3 text-[12px] text-slate-700">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sieć tras</div>
        <p className="mt-1 text-[11px] text-slate-500">
          Authored Routing Graph — niezależny od layoutu fizycznego i starego auto-grafu.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {(
          [
            ["select", "Wybierz"],
            ["add_node", "Punkt"],
            ["draw_edge", "Odcinek"],
            ["test_route", "Testuj trasę"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTool(id)}
            className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
              tool === id ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={routing.saving || !routing.dirty}
          onClick={() => void routing.save()}
          className="h-8 flex-1 rounded-lg bg-cyan-600 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          {routing.saving ? "Zapisywanie…" : "Zapisz sieć"}
        </button>
        <button
          type="button"
          onClick={() => void routing.runValidate()}
          className="h-8 flex-1 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold"
        >
          Sprawdź sieć tras
        </button>
      </div>
      {routing.error && (
        <div className="space-y-1 rounded-md bg-rose-50 px-2 py-1 text-rose-700">
          <div>{routing.error}</div>
          <button type="button" className="underline" onClick={() => void routing.load()}>
            Odśwież sieć tras
          </button>
        </div>
      )}

      {routing.dirty && <div className="text-amber-700">Niezapisane zmiany sieci tras</div>}

      {tool === "test_route" && (
        <div className="space-y-2 rounded-lg border border-sky-100 bg-sky-50/60 p-2">
          <div className="font-semibold text-sky-900">Testuj trasę (nowy silnik)</div>
          <label className="block">
            Start
            <select
              className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
              value={testStartUuid ?? ""}
              onChange={(e) => setTestStartUuid(e.target.value || null)}
            >
              <option value="">—</option>
              {routing.nodes.map((n) => (
                <option key={n.uuid} value={n.uuid}>
                  {n.label || n.uuid.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Cel
            <select
              className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
              value={testDestUuid ?? ""}
              onChange={(e) => setTestDestUuid(e.target.value || null)}
            >
              <option value="">—</option>
              {routing.nodes.map((n) => (
                <option key={n.uuid} value={n.uuid}>
                  {n.label || n.uuid.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Proces
            <select
              className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
              value={processType}
              onChange={(e) => setProcessType(e.target.value)}
            >
              <option value="">dowolny</option>
              {ROUTING_PROCESS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Transport
            <select
              className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
              value={transportType}
              onChange={(e) => setTransportType(e.target.value)}
            >
              <option value="">dowolny</option>
              {ROUTING_TRANSPORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="h-8 w-full rounded-lg bg-sky-700 text-[11px] font-semibold text-white"
            onClick={() => {
              if (!testStartUuid || !testDestUuid) return;
              void routing.runTestRoute(
                testStartUuid,
                testDestUuid,
                processType || null,
                transportType || null
              );
            }}
          >
            Oblicz A→B
          </button>
          {routing.testResult && (
            <div className="text-[11px]">
              {routing.testResult.ok ? (
                <div className="text-emerald-800">
                  Dystans: {routing.testResult.distance_m?.toFixed(2)} m · koszt:{" "}
                  {routing.testResult.cost?.toFixed(2)} · odcinki: {routing.testResult.hop_count}
                </div>
              ) : (
                <div className="text-rose-700">
                  {routing.testResult.error_code}: {routing.testResult.message}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {routing.validation && (
        <div className="space-y-1 rounded-lg border border-slate-200 p-2">
          <div className="font-semibold">
            Walidacja: {routing.validation.ok ? "OK" : "Błędy"}
          </div>
          <ul className="max-h-40 space-y-1 overflow-auto">
            {routing.validation.issues.map((i, idx) => (
              <li
                key={`${i.code}-${idx}`}
                className={i.severity === "error" ? "text-rose-700" : "text-amber-700"}
              >
                [{i.severity}] {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedNode && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-2">
          <div className="font-semibold">Punkt trasy</div>
          <label className="block">
            Etykieta
            <input
              className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
              value={selectedNode.label ?? ""}
              onChange={(e) => routing.updateNode(selectedNode.uuid, { label: e.target.value })}
            />
          </label>
          <label className="block">
            Typ operacyjny
            <select
              className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
              value={selectedNode.operational_type ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                routing.updateNode(selectedNode.uuid, {
                  operational_type: v,
                  node_type: v ? "operational" : "junction",
                });
              }}
            >
              <option value="">— skrzyżowanie / zwykły —</option>
              {ROUTING_OP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="text-[10px] text-slate-500">
            Współrzędne: x={selectedNode.x.toFixed(1)} cm, y={selectedNode.y.toFixed(1)} cm
          </div>
          <button
            type="button"
            className="text-rose-700 underline"
            onClick={() => {
              const edgeCount = routing.edges.filter(
                (e) => e.from_node_uuid === selectedNode.uuid || e.to_node_uuid === selectedNode.uuid
              ).length;
              const apCount = routing.accessPoints.filter((a) => a.node_uuid === selectedNode.uuid).length;
              const parts: string[] = [];
              if (edgeCount) parts.push(`${edgeCount} odcinków tras`);
              if (apCount) parts.push(`${apCount} dostępów do lokalizacji`);
              if (selectedNode.operational_type) parts.push("punkt operacyjny");
              const extra = parts.length ? ` Usunięte zostaną także: ${parts.join(", ")}.` : "";
              if (
                !window.confirm(
                  `Usunąć punkt trasy „${selectedNode.label || "bez nazwy"}”?${extra}`
                )
              ) {
                return;
              }
              routing.removeNode(selectedNode.uuid);
              setSelectedNodeUuid(null);
            }}
          >
            Usuń punkt trasy
          </button>

          <div className="border-t border-slate-100 pt-2">
            <div className="mb-1 font-semibold">Dostęp do lokalizacji</div>
            <select
              className="w-full rounded border border-slate-200 px-1 py-1"
              value={apLocationId}
              onChange={(e) => setApLocationId(e.target.value)}
            >
              <option value="">— lokalizacja —</option>
              {locations.map((l) => (
                <option key={l.id} value={String(l.id)}>
                  {l.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="mt-1 h-7 w-full rounded border border-slate-200"
              disabled={!apLocationId}
              onClick={() => {
                const id = Number(apLocationId);
                if (!Number.isFinite(id)) return;
                routing.upsertAccessPoint(id, selectedNode.uuid, locations.find((l) => l.id === id)?.name);
              }}
            >
              Przypisz dostęp do lokalizacji
            </button>
          </div>
        </div>
      )}

      {selectedEdge && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-2">
          <div className="font-semibold">Odcinek trasy</div>
          <label className="block">
            Kierunek ruchu
            <select
              className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
              value={selectedEdge.direction}
              onChange={(e) => routing.updateEdge(selectedEdge.uuid, { direction: e.target.value })}
            >
              <option value="BOTH">Dwukierunkowy</option>
              <option value="FORWARD">Tylko od → do</option>
              <option value="BACKWARD">Tylko do → od</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedEdge.enabled}
              onChange={(e) => routing.updateEdge(selectedEdge.uuid, { enabled: e.target.checked })}
            />
            Włączony
          </label>
          <label className="block">
            Mnożnik kosztu
            <input
              type="number"
              step="0.1"
              min="0.1"
              className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
              value={selectedEdge.cost_multiplier}
              onChange={(e) =>
                routing.updateEdge(selectedEdge.uuid, { cost_multiplier: Number(e.target.value) || 1 })
              }
            />
          </label>
          <label className="block">
            Dozwolone procesy (puste = wszystkie)
            <select
              multiple
              className="mt-0.5 h-20 w-full rounded border border-slate-200 px-1 py-1"
              value={selectedEdge.allowed_processes}
              onChange={(e) => {
                const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
                routing.updateEdge(selectedEdge.uuid, { allowed_processes: vals });
              }}
            >
              {ROUTING_PROCESS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Dozwolony transport (puste = wszystkie)
            <select
              multiple
              className="mt-0.5 h-20 w-full rounded border border-slate-200 px-1 py-1"
              value={selectedEdge.allowed_transport_types}
              onChange={(e) => {
                const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
                routing.updateEdge(selectedEdge.uuid, { allowed_transport_types: vals });
              }}
            >
              {ROUTING_TRANSPORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="text-[10px] text-slate-500">
            Dystans fizyczny: {selectedEdge.distance_m.toFixed(2)} m
          </div>
          <button
            type="button"
            className="text-rose-700 underline"
            onClick={() => {
              if (!window.confirm("Usunąć odcinek trasy?")) return;
              routing.removeEdge(selectedEdge.uuid);
              setSelectedEdgeUuid(null);
            }}
          >
            Usuń odcinek trasy
          </button>
        </div>
      )}

      <div className="text-[10px] text-slate-400">
        Węzły: {routing.nodes.length} · Odcinki: {routing.edges.length} · Access:{" "}
        {routing.accessPoints.length}
      </div>
    </aside>
  );
}
