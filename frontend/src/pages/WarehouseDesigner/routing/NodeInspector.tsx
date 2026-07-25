/**
 * Full node configuration panel (Routing Designer).
 * Consumes selection via props — does not own selection state.
 */

import { useMemo, useState } from "react";
import type { RoutingEdge, RoutingNode } from "../../../api/warehouseRoutingApi";
import {
  edgesConnectedTo,
  isCrossroads,
  nodeDisplayName,
  opTypeLabel,
} from "./routingDisplay";
import { ROUTING_OP_OPTIONS, type RoutingTool } from "./routingLabels";
import type { useRoutingGraph } from "./useRoutingGraph";
import { deleteSelectedNode } from "./routingNodeActions";

type Hook = ReturnType<typeof useRoutingGraph>;

export type NodeInspectorProps = {
  routing: Hook;
  selectedNode: RoutingNode;
  locations: { id: number; name: string; location_type?: string | null }[];
  setSelectedNodeUuid: (u: string | null) => void;
  setSelectedEdgeUuid: (u: string | null) => void;
  setTool: (t: RoutingTool) => void;
  setHighlightOrphanUuids: (ids: string[]) => void;
};

function isGenericDisplayLabel(label: string | null | undefined): boolean {
  const t = (label ?? "").trim();
  return !t || t === "Punkt trasy" || t === "Węzeł sieci";
}

export function NodeInspector({
  routing,
  selectedNode,
  locations,
  setSelectedNodeUuid,
  setSelectedEdgeUuid,
  setTool,
  setHighlightOrphanUuids,
}: NodeInspectorProps) {
  const [apSearch, setApSearch] = useState("");
  const [locPickerOpen, setLocPickerOpen] = useState(false);

  const connectedEdges = useMemo(
    () => edgesConnectedTo(selectedNode.uuid, routing.edges),
    [selectedNode.uuid, routing.edges]
  );

  const nameOf = (n: RoutingNode) =>
    nodeDisplayName(n, routing.accessPoints, locations, routing.nodes, routing.edges);

  const filteredLocations = useMemo(() => {
    const q = apSearch.trim().toLowerCase();
    if (!q) return locations.slice(0, 40);
    return locations.filter((l) => l.name.toLowerCase().includes(q)).slice(0, 40);
  }, [locations, apSearch]);

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">
            {isCrossroads(selectedNode, routing.edges) ? "Skrzyżowanie" : "Punkt trasy"}
          </div>
          {selectedNode.operational_type && (
            <div className="text-[10px] text-slate-500">{nameOf(selectedNode)}</div>
          )}
        </div>
      </div>

      <button
        type="button"
        data-testid="routing-delete-node"
        className="w-full rounded-md border border-rose-300 bg-rose-600 py-2 text-[12px] font-semibold text-white hover:bg-rose-700"
        onClick={() => {
          if (deleteSelectedNode(routing, selectedNode, setSelectedNodeUuid, locations)) {
            setHighlightOrphanUuids([]);
          }
        }}
      >
        Usuń punkt
      </button>

      <label className="block">
        Nazwa
        <input
          className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
          value={isGenericDisplayLabel(selectedNode.label) ? "" : (selectedNode.label ?? "")}
          placeholder="opcjonalnie"
          onChange={(e) =>
            routing.updateNode(selectedNode.uuid, { label: e.target.value.trim() || null })
          }
        />
      </label>

      <label className="block">
        Typ punktu
        <select
          className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
          value={
            selectedNode.operational_type &&
            !ROUTING_OP_OPTIONS.some((o) => o.value === selectedNode.operational_type)
              ? selectedNode.operational_type
              : (selectedNode.operational_type ?? "")
          }
          onChange={(e) => {
            const v = e.target.value || null;
            const opLab = v ? ROUTING_OP_OPTIONS.find((o) => o.value === v)?.label ?? null : null;
            routing.updateNode(selectedNode.uuid, {
              operational_type: v,
              node_type: v ? "operational" : "junction",
              label:
                v && isGenericDisplayLabel(selectedNode.label) ? opLab ?? null : selectedNode.label,
            });
          }}
        >
          <option value="">Trasa</option>
          {ROUTING_OP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {selectedNode.operational_type &&
            !ROUTING_OP_OPTIONS.some((o) => o.value === selectedNode.operational_type) && (
              <option value={selectedNode.operational_type}>
                {opTypeLabel(selectedNode.operational_type) || selectedNode.operational_type}
              </option>
            )}
        </select>
      </label>

      <div>
        <div className="mb-0.5 font-semibold">Połączone odcinki ({connectedEdges.length})</div>
        {connectedEdges.length === 0 ? (
          <div className="text-[10px] text-slate-400">Brak — punkt nie jest częścią trasy</div>
        ) : (
          <ul className="max-h-20 space-y-0.5 overflow-auto text-[11px]">
            {connectedEdges.map((e: RoutingEdge) => {
              const other =
                e.from_node_uuid === selectedNode.uuid ? e.to_node_uuid : e.from_node_uuid;
              const otherNode = routing.nodes.find((n) => n.uuid === other);
              return (
                <li key={e.uuid}>
                  <button
                    type="button"
                    className="text-left text-sky-800 underline"
                    onClick={() => {
                      setSelectedEdgeUuid(e.uuid);
                      setSelectedNodeUuid(null);
                      setTool("select");
                    }}
                  >
                    → {otherNode ? nameOf(otherNode) : "punkt"} ({e.distance_m.toFixed(1)} m)
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-100 pt-2">
        <div className="mb-1 font-semibold">Dostęp lokalizacji</div>
        <p className="mb-1 text-[10px] text-slate-500">
          Dostęp do trasy wylicza się automatycznie po stronie regału. Ręczne przypisanie to wyjątek
          (nadpisanie).
        </p>
        <div className="mb-2 flex flex-wrap gap-1">
          <button
            type="button"
            className="h-7 flex-1 rounded border border-slate-200 text-[10px] font-semibold"
            onClick={() => void routing.recomputeAccess()}
          >
            Przelicz dostęp AUTO
          </button>
          <button
            type="button"
            className={`h-7 flex-1 rounded border text-[10px] font-semibold ${
              routing.showAccessDiagnostics
                ? "border-sky-300 bg-sky-50 text-sky-900"
                : "border-slate-200"
            }`}
            onClick={() => routing.setShowAccessDiagnostics((v) => !v)}
          >
            {routing.showAccessDiagnostics ? "Ukryj diagnostykę" : "Diagnostyka dostępu"}
          </button>
        </div>
        {routing.showAccessDiagnostics && (
          <p className="mb-2 text-[10px] text-slate-500">
            Domyślnie: marker strony obsługi per regał (OK / do sprawdzenia / brak). Kliknij regał, aby
            zobaczyć podejścia S→P.
          </p>
        )}
        <ul className="mb-2 flex max-h-24 flex-wrap gap-1 overflow-auto">
          {routing.accessPoints
            .filter((a) => a.node_uuid === selectedNode.uuid)
            .map((a) => {
              const locName =
                locations.find((l) => l.id === a.location_id)?.name ?? `Lokalizacja ${a.location_id}`;
              return (
                <li
                  key={a.uuid}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900"
                  title="Ręczne nadpisanie (wyjątek)"
                >
                  {locName}
                  <button
                    type="button"
                    className="font-bold text-amber-800"
                    title="Odłącz nadpisanie"
                    onClick={() => routing.removeAccessPoint(a.uuid)}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          {routing.accessPoints.filter((a) => a.node_uuid === selectedNode.uuid).length === 0 && (
            <li className="text-[10px] text-slate-400">Brak ręcznych nadpisań na tym punkcie.</li>
          )}
        </ul>
        {!locPickerOpen ? (
          <button
            type="button"
            className="h-7 w-full rounded border border-dashed border-slate-300 text-[10px] font-semibold text-slate-600"
            onClick={() => setLocPickerOpen(true)}
          >
            Nadpisz ręcznie (wyjątek)…
          </button>
        ) : (
          <div className="space-y-1 rounded border border-slate-200 p-1.5">
            <input
              className="w-full rounded border border-slate-200 px-1 py-1"
              placeholder="Szukaj: A1, RK-01…"
              value={apSearch}
              onChange={(e) => setApSearch(e.target.value)}
              autoFocus
            />
            <ul className="max-h-28 overflow-auto">
              {filteredLocations.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className="w-full rounded px-1 py-0.5 text-left hover:bg-slate-100"
                    onClick={() => {
                      routing.upsertAccessPoint(l.id, selectedNode.uuid, l.name);
                      setLocPickerOpen(false);
                      setApSearch("");
                    }}
                  >
                    {l.name}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="text-[10px] underline"
              onClick={() => setLocPickerOpen(false)}
            >
              Anuluj
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
