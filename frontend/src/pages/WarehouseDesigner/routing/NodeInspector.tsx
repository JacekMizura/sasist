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
import {
  Card,
  CardButton,
  DangerButton,
  GhostButton,
  Input,
  SecondaryButton,
  Select,
} from "../../../design-system";

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
    <Card variant="section" density="compact" className="space-y-2">
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

      <DangerButton
        data-testid="routing-delete-node"
        density="default"
        className="w-full"
        onClick={() => {
          if (deleteSelectedNode(routing, selectedNode, setSelectedNodeUuid, locations)) {
            setHighlightOrphanUuids([]);
          }
        }}
      >
        Usuń punkt
      </DangerButton>

      <label className="block">
        Nazwa
        <Input
          density="compact"
          className="mt-0.5"
          value={isGenericDisplayLabel(selectedNode.label) ? "" : (selectedNode.label ?? "")}
          placeholder="opcjonalnie"
          onChange={(e) =>
            routing.updateNode(selectedNode.uuid, { label: e.target.value.trim() || null })
          }
        />
      </label>

      <label className="block">
        Typ punktu
        <Select
          density="compact"
          className="mt-0.5"
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
        </Select>
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
                  <GhostButton
                    density="compact"
                    className="justify-start text-left"
                    onClick={() => {
                      setSelectedEdgeUuid(e.uuid);
                      setSelectedNodeUuid(null);
                      setTool("select");
                    }}
                  >
                    → {otherNode ? nameOf(otherNode) : "punkt"} ({e.distance_m.toFixed(1)} m)
                  </GhostButton>
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
          <SecondaryButton
            density="compact"
            className="flex-1"
            onClick={() => void routing.recomputeAccess()}
          >
            Przelicz dostęp AUTO
          </SecondaryButton>
          <CardButton
            density="compact"
            fullWidth
            className="flex-1"
            active={routing.showAccessDiagnostics}
            onClick={() => routing.setShowAccessDiagnostics((v) => !v)}
          >
            {routing.showAccessDiagnostics ? "Ukryj diagnostykę" : "Diagnostyka dostępu"}
          </CardButton>
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
          <SecondaryButton density="compact" className="w-full" onClick={() => setLocPickerOpen(true)}>
            Nadpisz ręcznie (wyjątek)…
          </SecondaryButton>
        ) : (
          <div className="space-y-1 rounded border border-slate-200 p-1.5">
            <Input
              density="compact"
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
            <GhostButton density="compact" onClick={() => setLocPickerOpen(false)}>
              Anuluj
            </GhostButton>
          </div>
        )}
      </div>
    </Card>
  );
}
