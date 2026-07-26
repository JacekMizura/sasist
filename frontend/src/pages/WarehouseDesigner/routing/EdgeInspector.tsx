/**
 * Full edge configuration panel (Routing Designer).
 * Select-based rewire remains as fallback; primary UX is canvas endpoint drag.
 */

import { useState } from "react";
import type { RoutingEdge, RoutingNode } from "../../../api/warehouseRoutingApi";
import { nodeDisplayName } from "./routingDisplay";
import { ROUTING_PROCESS_OPTIONS, ROUTING_TRANSPORT_OPTIONS, type RoutingTool } from "./routingLabels";
import type { useRoutingGraph } from "./useRoutingGraph";
import { Card, DangerButton, GhostButton, Select } from "../../../design-system";

type Hook = ReturnType<typeof useRoutingGraph>;

export type EdgeInspectorProps = {
  routing: Hook;
  selectedEdge: RoutingEdge;
  tool: RoutingTool;
  locations: { id: number; name: string; location_type?: string | null }[];
  setSelectedEdgeUuid: (u: string | null) => void;
};

export function EdgeInspector({
  routing,
  selectedEdge,
  tool,
  locations,
  setSelectedEdgeUuid,
}: EdgeInspectorProps) {
  const [edgeRestrictionsOpen, setEdgeRestrictionsOpen] = useState(false);

  const nameOf = (n: RoutingNode) =>
    nodeDisplayName(n, routing.accessPoints, locations, routing.nodes, routing.edges);

  const fromNode = routing.nodes.find((n) => n.uuid === selectedEdge.from_node_uuid);
  const toNode = routing.nodes.find((n) => n.uuid === selectedEdge.to_node_uuid);

  return (
    <Card variant="section" density="compact" className="space-y-2">
      <div className="font-semibold">Odcinek trasy</div>
      <div className="text-[10px] text-slate-500">
        {fromNode
          ? nameOf(fromNode)
          : "punkt"}
        {" → "}
        {toNode ? nameOf(toNode) : "punkt"}
      </div>
      <div className="text-[10px] text-slate-500">Długość: {selectedEdge.distance_m.toFixed(2)} m</div>
      <label className="block">
        Kierunek
        <Select
          density="compact"
          className="mt-0.5"
          value={selectedEdge.direction}
          onChange={(e) => routing.updateEdge(selectedEdge.uuid, { direction: e.target.value })}
        >
          <option value="BOTH">Dwukierunkowy</option>
          <option value="FORWARD">Jednokierunkowy (zgodnie z odcinkiem)</option>
          <option value="BACKWARD">Jednokierunkowy (przeciwnie)</option>
        </Select>
      </label>
      {tool === "edit" && (
        <div className="space-y-1 rounded border border-amber-100 bg-amber-50/60 p-2">
          <div className="text-[10px] font-semibold text-amber-900">Przepnij końce</div>
          <p className="text-[10px] text-amber-800/80">
            Preferuj przeciąganie uchwytów na mapie. Poniżej — fallback listą.
          </p>
          <label className="block text-[10px]">
            Od
            <Select
              density="compact"
              className="mt-0.5"
              value={selectedEdge.from_node_uuid}
              onChange={(e) => {
                const ok = routing.rewireEdgeEndpoint(selectedEdge.uuid, "from", e.target.value);
                if (ok) routing.normalizeAfterEdit();
                else window.alert("Nie można przepiąć — pętla lub duplikat odcinka.");
              }}
            >
              {routing.nodes.map((n) => (
                <option key={n.uuid} value={n.uuid}>
                  {nameOf(n)}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-[10px]">
            Do
            <Select
              density="compact"
              className="mt-0.5"
              value={selectedEdge.to_node_uuid}
              onChange={(e) => {
                const ok = routing.rewireEdgeEndpoint(selectedEdge.uuid, "to", e.target.value);
                if (ok) routing.normalizeAfterEdit();
                else window.alert("Nie można przepiąć — pętla lub duplikat odcinka.");
              }}
            >
              {routing.nodes.map((n) => (
                <option key={n.uuid} value={n.uuid}>
                  {nameOf(n)}
                </option>
              ))}
            </Select>
          </label>
        </div>
      )}
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={selectedEdge.enabled}
          onChange={(e) => routing.updateEdge(selectedEdge.uuid, { enabled: e.target.checked })}
        />
        Droga aktywna
      </label>

      <div className="rounded border border-slate-100 bg-slate-50/80 p-2">
        <GhostButton
          density="compact"
          className="w-full justify-between"
          onClick={() => setEdgeRestrictionsOpen((v) => !v)}
        >
          Opcjonalne ograniczenia
          <span className="text-[10px] font-normal text-slate-500">
            {edgeRestrictionsOpen ? "ukryj" : "rozwiń"}
          </span>
        </GhostButton>
        {!edgeRestrictionsOpen && (
          <p className="mt-1 text-[10px] text-slate-500">
            {!selectedEdge.allowed_processes?.length && !selectedEdge.allowed_transport_types?.length
              ? "Dostępny dla wszystkich procesów i środków transportu"
              : "Ustawiono ograniczenia"}
          </p>
        )}
        {edgeRestrictionsOpen && (
          <div className="mt-2 space-y-2">
            <p className="text-[10px] text-slate-500">Puste = bez ograniczenia.</p>
            <label className="block">
              Procesy
              <Select
                multiple
                density="compact"
                className="mt-0.5 h-16"
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
              </Select>
            </label>
            <GhostButton
              density="compact"
              onClick={() => routing.updateEdge(selectedEdge.uuid, { allowed_processes: [] })}
            >
              Wszystkie procesy
            </GhostButton>
            <label className="block">
              Transport
              <Select
                multiple
                density="compact"
                className="mt-0.5 h-16"
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
              </Select>
            </label>
            <GhostButton
              density="compact"
              onClick={() => routing.updateEdge(selectedEdge.uuid, { allowed_transport_types: [] })}
            >
              Wszystkie środki transportu
            </GhostButton>
          </div>
        )}
      </div>

      <DangerButton
        density="compact"
        className="w-full"
        onClick={() => {
          if (!window.confirm("Usunąć ten odcinek trasy?")) return;
          routing.removeEdge(selectedEdge.uuid);
          setSelectedEdgeUuid(null);
        }}
      >
        Usuń odcinek
      </DangerButton>
    </Card>
  );
}
