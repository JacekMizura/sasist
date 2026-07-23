import { useMemo, useState } from "react";
import type { RoutingEdge, RoutingNode } from "../../../api/warehouseRoutingApi";
import {
  confirmDeleteNodeMessage,
  edgesConnectedTo,
  nodeDisplayName,
  orphanNodeUuids,
} from "./routingDisplay";
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
  highlightOrphanUuids: string[];
  setHighlightOrphanUuids: (ids: string[]) => void;
};

export function deleteSelectedNode(
  routing: Hook,
  selectedNode: RoutingNode,
  setSelectedNodeUuid: (u: string | null) => void,
  locations: { id: number; name: string }[] = []
) {
  const msg = confirmDeleteNodeMessage(
    selectedNode,
    routing.edges,
    routing.accessPoints,
    routing.nodes,
    locations
  );
  if (!window.confirm(msg)) return false;
  routing.removeNode(selectedNode.uuid);
  setSelectedNodeUuid(null);
  return true;
}

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
  highlightOrphanUuids,
  setHighlightOrphanUuids,
}: Props) {
  const [processType, setProcessType] = useState("");
  const [transportType, setTransportType] = useState("");
  const [apSearch, setApSearch] = useState("");
  const [testAdvanced, setTestAdvanced] = useState(false);
  const [edgeRestrictionsOpen, setEdgeRestrictionsOpen] = useState(false);
  const [locPickerOpen, setLocPickerOpen] = useState(false);

  const selectedNode = useMemo(
    () => routing.nodes.find((n) => n.uuid === selectedNodeUuid) ?? null,
    [routing.nodes, selectedNodeUuid]
  );
  const selectedEdge = useMemo(
    () => routing.edges.find((e) => e.uuid === selectedEdgeUuid) ?? null,
    [routing.edges, selectedEdgeUuid]
  );
  const connectedEdges = useMemo(
    () => (selectedNode ? edgesConnectedTo(selectedNode.uuid, routing.edges) : []),
    [selectedNode, routing.edges]
  );
  const orphans = useMemo(
    () => orphanNodeUuids(routing.nodes, routing.edges),
    [routing.nodes, routing.edges]
  );
  const opCount = routing.nodes.filter((n) => n.operational_type).length;

  const filteredLocations = useMemo(() => {
    const q = apSearch.trim().toLowerCase();
    if (!q) return locations.slice(0, 40);
    return locations.filter((l) => l.name.toLowerCase().includes(q)).slice(0, 40);
  }, [locations, apSearch]);

  const editingPoint = Boolean(selectedNode && tool === "select");
  const editingEdge = Boolean(selectedEdge && tool === "select" && !selectedNode);
  const showIdle = !editingPoint && !editingEdge && tool !== "test_route";

  const nameOf = (n: RoutingNode) =>
    nodeDisplayName(n, routing.accessPoints, locations, routing.nodes);

  const removeOrphansAction = () => {
    const n = orphans.length;
    if (!n) return;
    if (
      !window.confirm(
        `Sieć zawiera ${n} niepołączonych punktów.\nMożesz je usunąć i narysować sieć od nowa.\n\nUsunąć niepołączone punkty?`
      )
    ) {
      return;
    }
    routing.removeOrphanNodes();
    setSelectedNodeUuid(null);
    setHighlightOrphanUuids([]);
  };

  return (
    <aside className="flex h-full min-h-0 w-[320px] shrink-0 flex-col gap-3 overflow-auto border-l border-slate-200 bg-white p-3 text-[12px] text-slate-700">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sieć tras</div>
        <p className="mt-1 text-[11px] text-slate-500">
          Rysuj drogi magazynowe. Jedna wspólna sieć dla wszystkich procesów.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {(
          [
            ["draw_edge", "Rysuj trasę"],
            ["select", "Wybierz"],
            ["test_route", "Testuj trasę"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTool(id);
              // Selection clearing is owned by parent setTool wrapper for draw/test.
              // Wybierz must stay sticky and keep current selection.
            }}
            className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
              tool === id ? "border-sky-700 bg-sky-700 text-white" : "border-slate-200 bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tool === "draw_edge" && (
        <p className="text-[11px] text-sky-900">
          Klikaj kolejne miejsca na mapie — odcinki powstają automatycznie. Enter lub Esc kończy
          rysowanie bieżącej drogi.
        </p>
      )}

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
          Sprawdź sieć
        </button>
      </div>

      {routing.error && (
        <div className="rounded-md bg-rose-50 px-2 py-1 text-rose-700">
          {routing.error}
          <button type="button" className="ml-2 underline" onClick={() => void routing.load()}>
            Odśwież
          </button>
        </div>
      )}
      {routing.dirty && <div className="text-amber-700">Niezapisane zmiany</div>}

      {showIdle && (
        <div className="text-[11px] text-slate-500">
          {routing.nodes.length} punktów · {routing.edges.length} odcinków
          {orphans.length > 0 && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
              {routing.edges.length === 0
                ? `Sieć zawiera ${orphans.length} niepołączonych punktów. Możesz je usunąć i narysować sieć od nowa.`
                : orphans.length === 1
                  ? "1 punkt nie jest połączony z żadną trasą."
                  : `${orphans.length} punktów nie jest połączonych z żadną trasą.`}
              <button
                type="button"
                className="mt-1 block w-full rounded border border-amber-300 bg-white py-1 font-semibold"
                onClick={removeOrphansAction}
              >
                Usuń niepołączone punkty
              </button>
            </div>
          )}
        </div>
      )}

      {/* Validation — human, aggregated */}
      {routing.validation && showIdle && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-2">
          <div className="font-semibold">
            {routing.validation.ok ? "Sieć w porządku" : "Uwagi do sieci"}
          </div>
          <ul className="max-h-48 space-y-2 overflow-auto">
            {routing.validation.issues.map((i, idx) => (
              <li
                key={`${i.code}-${idx}`}
                className={i.severity === "error" ? "text-rose-800" : "text-amber-900"}
              >
                <div>{i.message}</div>
                {(i.code === "ORPHAN_NODES" || i.code === "NO_EDGES") &&
                  (i.ref_uuids?.length || orphans.length) > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold"
                        onClick={() =>
                          setHighlightOrphanUuids(i.ref_uuids?.length ? i.ref_uuids : orphans)
                        }
                      >
                        Podświetl na mapie
                      </button>
                      <button
                        type="button"
                        className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-800"
                        onClick={removeOrphansAction}
                      >
                        Usuń niepołączone punkty
                      </button>
                    </div>
                  )}
              </li>
            ))}
          </ul>
          {highlightOrphanUuids.length > 0 && (
            <button
              type="button"
              className="text-[10px] underline"
              onClick={() => setHighlightOrphanUuids([])}
            >
              Wyłącz podświetlenie
            </button>
          )}
        </div>
      )}

      {/* TEST — map-first flow */}
      {tool === "test_route" && (
        <div className="space-y-2 rounded-lg border border-sky-100 bg-sky-50/60 p-2">
          <div className="font-semibold text-sky-900">Testuj trasę</div>
          <p className="text-[11px] text-sky-900">
            {!testStartUuid
              ? "Kliknij punkt początkowy na mapie."
              : !testDestUuid
                ? "Kliknij punkt docelowy."
                : "Trasa obliczona. Kliknij punkt, aby zacząć nowy test."}
          </p>
          {(testStartUuid || testDestUuid) && (
            <div className="text-[11px] text-slate-600">
              {testStartUuid && (
                <div>
                  Start:{" "}
                  <strong>
                    {nameOf(
                      routing.nodes.find((n) => n.uuid === testStartUuid) ??
                        ({ uuid: testStartUuid, warehouse_id: 0, x: 0, y: 0, node_type: "junction" } as RoutingNode)
                    )}
                  </strong>
                </div>
              )}
              {testDestUuid && (
                <div>
                  Cel:{" "}
                  <strong>
                    {nameOf(
                      routing.nodes.find((n) => n.uuid === testDestUuid) ??
                        ({ uuid: testDestUuid, warehouse_id: 0, x: 0, y: 0, node_type: "junction" } as RoutingNode)
                    )}
                  </strong>
                </div>
              )}
            </div>
          )}
          <details className="text-[11px]">
            <summary className="cursor-pointer text-slate-500">Wybór z listy (opcjonalnie)</summary>
            <div className="mt-2 space-y-2">
              <label className="block">
                Start
                <select
                  className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
                  value={testStartUuid ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setTestStartUuid(v);
                    if (v && testDestUuid) void routing.runTestRoute(v, testDestUuid);
                  }}
                >
                  <option value="">—</option>
                  {routing.nodes.map((n) => (
                    <option key={n.uuid} value={n.uuid}>
                      {nameOf(n)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Cel
                <select
                  className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
                  value={testDestUuid ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setTestDestUuid(v);
                    if (testStartUuid && v) void routing.runTestRoute(testStartUuid, v);
                  }}
                >
                  <option value="">—</option>
                  {routing.nodes.map((n) => (
                    <option key={n.uuid} value={n.uuid}>
                      {nameOf(n)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
          <button
            type="button"
            className="text-[11px] text-sky-800 underline"
            onClick={() => setTestAdvanced((v) => !v)}
          >
            {testAdvanced ? "Ukryj zaawansowane" : "Zaawansowane ustawienia"}
          </button>
          {testAdvanced && (
            <div className="space-y-2 border-t border-sky-100 pt-2">
              <label className="block">
                Proces (opcjonalnie)
                <select
                  className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
                  value={processType}
                  onChange={(e) => setProcessType(e.target.value)}
                >
                  <option value="">bez ograniczenia</option>
                  {ROUTING_PROCESS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Transport (opcjonalnie)
                <select
                  className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
                  value={transportType}
                  onChange={(e) => setTransportType(e.target.value)}
                >
                  <option value="">bez ograniczenia</option>
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
                Przelicz z ograniczeniami
              </button>
            </div>
          )}
          {routing.testResult && (
            <div className="text-[11px]">
              {routing.testResult.ok ? (
                <div className="text-emerald-800">
                  Dystans: {routing.testResult.distance_m?.toFixed(2)} m · odcinki:{" "}
                  {routing.testResult.hop_count}
                </div>
              ) : (
                <div className="text-rose-700">{routing.testResult.message}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SELECTED POINT */}
      {editingPoint && selectedNode && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold">Punkt trasy</div>
              <div className="text-[10px] text-slate-500">{nameOf(selectedNode)}</div>
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
              value={
                isGenericDisplayLabel(selectedNode.label) ? "" : (selectedNode.label ?? "")
              }
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
              value={selectedNode.operational_type ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                const opLab = ROUTING_OP_OPTIONS.find((o) => o.value === v)?.label;
                routing.updateNode(selectedNode.uuid, {
                  operational_type: v,
                  node_type: v ? "operational" : "junction",
                  label:
                    v && isGenericDisplayLabel(selectedNode.label) ? opLab ?? null : selectedNode.label,
                });
              }}
            >
              <option value="">Zwykły punkt trasy</option>
              {ROUTING_OP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <div>
            <div className="mb-0.5 font-semibold">
              Połączone odcinki ({connectedEdges.length})
            </div>
            {connectedEdges.length === 0 ? (
              <div className="text-[10px] text-slate-400">Brak — punkt nie jest częścią trasy</div>
            ) : (
              <ul className="max-h-20 space-y-0.5 overflow-auto text-[11px]">
                {connectedEdges.map((e) => {
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
            <div className="mb-1 font-semibold">Obsługiwane lokalizacje</div>
            <p className="mb-1 text-[10px] text-slate-500">
              Lokalizacje magazynowe dostępne z tego miejsca trasy.
            </p>
            <ul className="mb-2 flex max-h-24 flex-wrap gap-1 overflow-auto">
              {routing.accessPoints
                .filter((a) => a.node_uuid === selectedNode.uuid)
                .map((a) => {
                  const locName =
                    locations.find((l) => l.id === a.location_id)?.name ?? `Lokalizacja ${a.location_id}`;
                  return (
                    <li
                      key={a.uuid}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-900"
                    >
                      {locName}
                      <button
                        type="button"
                        className="font-bold text-emerald-700"
                        title="Odłącz"
                        onClick={() => routing.removeAccessPoint(a.uuid)}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              {routing.accessPoints.filter((a) => a.node_uuid === selectedNode.uuid).length === 0 && (
                <li className="text-[10px] text-slate-400">Brak przypisanych lokalizacji.</li>
              )}
            </ul>
            {!locPickerOpen ? (
              <button
                type="button"
                className="h-7 w-full rounded border border-slate-200 font-semibold"
                onClick={() => setLocPickerOpen(true)}
              >
                + Przypisz lokalizację
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
      )}

      {/* SELECTED EDGE */}
      {editingEdge && selectedEdge && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-2">
          <div className="font-semibold">Odcinek trasy</div>
          <div className="text-[10px] text-slate-500">
            {nameOf(
              routing.nodes.find((n) => n.uuid === selectedEdge.from_node_uuid) ??
                ({ uuid: "x", warehouse_id: 0, x: 0, y: 0, node_type: "junction" } as RoutingNode)
            )}
            {" → "}
            {nameOf(
              routing.nodes.find((n) => n.uuid === selectedEdge.to_node_uuid) ??
                ({ uuid: "y", warehouse_id: 0, x: 0, y: 0, node_type: "junction" } as RoutingNode)
            )}
          </div>
          <div className="text-[10px] text-slate-500">
            Długość: {selectedEdge.distance_m.toFixed(2)} m
          </div>
          <label className="block">
            Kierunek
            <select
              className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
              value={selectedEdge.direction}
              onChange={(e) => routing.updateEdge(selectedEdge.uuid, { direction: e.target.value })}
            >
              <option value="BOTH">Dwukierunkowy</option>
              <option value="FORWARD">Jednokierunkowy (zgodnie z odcinkiem)</option>
              <option value="BACKWARD">Jednokierunkowy (przeciwnie)</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedEdge.enabled}
              onChange={(e) => routing.updateEdge(selectedEdge.uuid, { enabled: e.target.checked })}
            />
            Aktywny odcinek
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
                routing.updateEdge(selectedEdge.uuid, {
                  cost_multiplier: Number(e.target.value) || 1,
                })
              }
            />
          </label>

          <div className="rounded border border-slate-100 bg-slate-50/80 p-2">
            <button
              type="button"
              className="flex w-full items-center justify-between font-semibold"
              onClick={() => setEdgeRestrictionsOpen((v) => !v)}
            >
              Opcjonalne ograniczenia
              <span className="text-[10px] font-normal text-slate-500">
                {edgeRestrictionsOpen ? "ukryj" : "rozwiń"}
              </span>
            </button>
            {!edgeRestrictionsOpen && (
              <p className="mt-1 text-[10px] text-slate-500">
                {!selectedEdge.allowed_processes?.length &&
                !selectedEdge.allowed_transport_types?.length
                  ? "Dostępny dla wszystkich procesów i środków transportu"
                  : "Ustawiono ograniczenia"}
              </p>
            )}
            {edgeRestrictionsOpen && (
              <div className="mt-2 space-y-2">
                <p className="text-[10px] text-slate-500">Puste = bez ograniczenia.</p>
                <label className="block">
                  Procesy
                  <select
                    multiple
                    className="mt-0.5 h-16 w-full rounded border border-slate-200 px-1 py-1"
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
                <button
                  type="button"
                  className="text-[10px] underline"
                  onClick={() => routing.updateEdge(selectedEdge.uuid, { allowed_processes: [] })}
                >
                  Wszystkie procesy
                </button>
                <label className="block">
                  Transport
                  <select
                    multiple
                    className="mt-0.5 h-16 w-full rounded border border-slate-200 px-1 py-1"
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
                <button
                  type="button"
                  className="text-[10px] underline"
                  onClick={() =>
                    routing.updateEdge(selectedEdge.uuid, { allowed_transport_types: [] })
                  }
                >
                  Wszystkie środki transportu
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="w-full rounded-md border border-rose-200 bg-rose-50 py-1.5 font-semibold text-rose-800"
            onClick={() => {
              if (!window.confirm("Usunąć ten odcinek trasy?")) return;
              routing.removeEdge(selectedEdge.uuid);
              setSelectedEdgeUuid(null);
            }}
          >
            Usuń odcinek
          </button>
        </div>
      )}

      {showIdle && routing.nodes.length > 0 && (
        <div className="mt-auto space-y-2 border-t border-slate-100 pt-2">
          <button
            type="button"
            className="w-full rounded-md border border-rose-300 py-1.5 text-[11px] font-semibold text-rose-800"
            onClick={() => {
              // Orphan-only network → clean orphans (main QA case).
              if (routing.edges.length === 0) {
                removeOrphansAction();
                return;
              }
              const ok = window.confirm(
                `Wyczyścić całą sieć tras?\n\n` +
                  `• Punkty: ${routing.nodes.length}\n` +
                  `• Odcinki: ${routing.edges.length}\n` +
                  `• Przypisania lokalizacji: ${routing.accessPoints.length}\n` +
                  `• Punkty specjalne: ${opCount}`
              );
              if (!ok) return;
              routing.clearGraph();
              setSelectedNodeUuid(null);
              setSelectedEdgeUuid(null);
              setTestStartUuid(null);
              setTestDestUuid(null);
              setHighlightOrphanUuids([]);
            }}
          >
            Wyczyść sieć
          </button>
        </div>
      )}
    </aside>
  );
}

function isGenericDisplayLabel(label: string | null | undefined): boolean {
  const t = (label ?? "").trim();
  return !t || t === "Punkt trasy" || t === "Węzeł sieci";
}
