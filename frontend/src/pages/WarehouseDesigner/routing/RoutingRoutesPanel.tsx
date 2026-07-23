import { useMemo, useState } from "react";
import type { RoutingEdge, RoutingNode } from "../../../api/warehouseRoutingApi";
import {
  confirmDeleteNodeMessage,
  edgesConnectedTo,
  nodeDisplayName,
  nodeKind,
  opTypeLabel,
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
};

function deleteSelectedNode(
  routing: Hook,
  selectedNode: RoutingNode,
  setSelectedNodeUuid: (u: string | null) => void
) {
  const msg = confirmDeleteNodeMessage(selectedNode, routing.edges, routing.accessPoints);
  if (!window.confirm(msg)) return;
  routing.removeNode(selectedNode.uuid);
  setSelectedNodeUuid(null);
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
}: Props) {
  const [processType, setProcessType] = useState<string>("");
  const [transportType, setTransportType] = useState<string>("");
  const [apLocationId, setApLocationId] = useState<string>("");
  const [testAdvanced, setTestAdvanced] = useState(false);
  const [edgeRestrictionsOpen, setEdgeRestrictionsOpen] = useState(false);

  const selectedNode: RoutingNode | null = useMemo(
    () => routing.nodes.find((n) => n.uuid === selectedNodeUuid) ?? null,
    [routing.nodes, selectedNodeUuid]
  );
  const selectedEdge: RoutingEdge | null = useMemo(
    () => routing.edges.find((e) => e.uuid === selectedEdgeUuid) ?? null,
    [routing.edges, selectedEdgeUuid]
  );
  const connectedEdges = useMemo(
    () => (selectedNode ? edgesConnectedTo(selectedNode.uuid, routing.edges) : []),
    [selectedNode, routing.edges]
  );
  const opCount = routing.nodes.filter((n) => n.operational_type).length;

  return (
    <aside className="flex h-full min-h-0 w-[320px] shrink-0 flex-col gap-3 overflow-auto border-l border-slate-200 bg-white p-3 text-[12px] text-slate-700">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sieć tras</div>
        <p className="mt-1 text-[11px] text-slate-500">
          Jedna wspólna sieć komunikacyjna magazynu. Rysuj ciągi jak drogi — ograniczenia procesu/transportu są opcjonalne.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {(
          [
            ["draw_edge", "Rysuj trasę"],
            ["select", "Wybierz"],
            ["add_node", "Dodaj punkt"],
            ["test_route", "Testuj trasę"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTool(id)}
            className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
              tool === id
                ? id === "draw_edge"
                  ? "border-sky-700 bg-sky-700 text-white"
                  : "border-sky-600 bg-sky-600 text-white"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tool === "draw_edge" && (
        <div className="rounded-md border border-sky-100 bg-sky-50/70 px-2 py-1.5 text-[11px] text-sky-900">
          Klikaj kolejne miejsca na mapie — powstaje ciągła trasa. Istniejący węzeł łączy się z siecią. Enter lub przycisk kończy.
          <button
            type="button"
            className="mt-1 block w-full rounded border border-sky-200 bg-white py-1 font-semibold"
            onClick={() => setTool("select")}
          >
            Zakończ rysowanie
          </button>
        </div>
      )}
      {tool === "select" && (
        <p className="text-[11px] text-slate-500">
          Kliknij węzeł lub odcinek, aby edytować. Przeciągnij węzeł (siatka 10 cm). Delete usuwa zaznaczony węzeł.
        </p>
      )}
      {tool === "add_node" && (
        <p className="text-[11px] text-slate-500">
          Narzędzie pomocnicze — klik pustego miejsca dodaje pojedynczy węzeł. Preferuj „Rysuj trasę”.
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
        <div className="space-y-1 rounded-md bg-rose-50 px-2 py-1 text-rose-700">
          <div>{routing.error}</div>
          <button type="button" className="underline" onClick={() => void routing.load()}>
            Odśwież
          </button>
        </div>
      )}
      {routing.dirty && <div className="text-amber-700">Niezapisane zmiany</div>}

      {tool === "test_route" && (
        <div className="space-y-2 rounded-lg border border-sky-100 bg-sky-50/60 p-2">
          <div className="font-semibold text-sky-900">Testuj trasę</div>
          <p className="text-[10px] text-slate-500">Kliknij start i cel na mapie albo wybierz z listy.</p>
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
                  {nodeDisplayName(n, routing.accessPoints, locations)}
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
                  {nodeDisplayName(n, routing.accessPoints, locations)}
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
                testAdvanced && processType ? processType : null,
                testAdvanced && transportType ? transportType : null
              );
            }}
          >
            Oblicz trasę
          </button>
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
            </div>
          )}
          {routing.testResult && (
            <div className="text-[11px]">
              {routing.testResult.ok ? (
                <div className="text-emerald-800">
                  Dystans: {routing.testResult.distance_m?.toFixed(2)} m · koszt:{" "}
                  {routing.testResult.cost?.toFixed(2)} · odcinki: {routing.testResult.hop_count}
                </div>
              ) : (
                <div className="text-rose-700">
                  {routing.testResult.message || routing.testResult.error_code}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {routing.validation && (
        <div className="space-y-1 rounded-lg border border-slate-200 p-2">
          <div className="font-semibold">Walidacja: {routing.validation.ok ? "OK" : "Uwagi"}</div>
          <ul className="max-h-32 space-y-1 overflow-auto">
            {routing.validation.issues.map((i, idx) => (
              <li
                key={`${i.code}-${idx}`}
                className={i.severity === "error" ? "text-rose-700" : "text-amber-700"}
              >
                {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedNode && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-2">
          <div className="font-semibold">
            {nodeKind(selectedNode, routing.accessPoints) === "operational"
              ? "Punkt operacyjny"
              : nodeKind(selectedNode, routing.accessPoints) === "access"
                ? "Węzeł z dostępem"
                : "Węzeł sieci"}
          </div>
          <div className="text-[10px] text-slate-500">
            {nodeDisplayName(selectedNode, routing.accessPoints, locations)}
          </div>
          <label className="block">
            Nazwa (opcjonalnie)
            <input
              className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
              value={selectedNode.label === "Punkt trasy" ? "" : (selectedNode.label ?? "")}
              placeholder="np. skrzyżowanie A1"
              onChange={(e) =>
                routing.updateNode(selectedNode.uuid, { label: e.target.value.trim() || null })
              }
            />
          </label>
          <label className="block">
            Rola operacyjna
            <select
              className="mt-0.5 w-full rounded border border-slate-200 px-1 py-1"
              value={selectedNode.operational_type ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                routing.updateNode(selectedNode.uuid, {
                  operational_type: v,
                  node_type: v ? "operational" : "junction",
                  label:
                    v && (!selectedNode.label || selectedNode.label === "Punkt trasy")
                      ? opTypeLabel(v)
                      : selectedNode.label,
                });
              }}
            >
              <option value="">Zwykły węzeł / skrzyżowanie</option>
              {ROUTING_OP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="text-[10px] text-slate-500">
            Pozycja: {selectedNode.x.toFixed(0)} × {selectedNode.y.toFixed(0)} cm
          </div>
          <div>
            <div className="mb-0.5 font-semibold">Podłączone odcinki ({connectedEdges.length})</div>
            {connectedEdges.length === 0 ? (
              <div className="text-[10px] text-slate-400">Brak — węzeł izolowany</div>
            ) : (
              <ul className="max-h-24 space-y-0.5 overflow-auto text-[11px]">
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
                        → {otherNode ? nodeDisplayName(otherNode, routing.accessPoints, locations) : "węzeł"}{" "}
                        ({e.distance_m.toFixed(1)} m)
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-slate-100 pt-2">
            <div className="mb-1 font-semibold">Dostęp do lokalizacji</div>
            <p className="mb-1 text-[10px] text-slate-500">
              Lokalizacja może mieć wiele dostępów do sieci (1..N).
            </p>
            <ul className="mb-2 max-h-20 space-y-1 overflow-auto text-[11px]">
              {routing.accessPoints
                .filter((a) => a.node_uuid === selectedNode.uuid)
                .map((a) => {
                  const locName =
                    locations.find((l) => l.id === a.location_id)?.name ?? `Lokalizacja #${a.location_id}`;
                  return (
                    <li key={a.uuid} className="flex items-center justify-between gap-1 rounded bg-slate-50 px-1.5 py-0.5">
                      <span>{locName}</span>
                      <button
                        type="button"
                        className="text-rose-600 underline"
                        onClick={() => routing.removeAccessPoint(a.uuid)}
                      >
                        odłącz
                      </button>
                    </li>
                  );
                })}
            </ul>
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
                const locName = locations.find((l) => l.id === id)?.name;
                routing.upsertAccessPoint(id, selectedNode.uuid, locName ? `Dostęp: ${locName}` : undefined);
              }}
            >
              Dodaj dostęp
            </button>
          </div>
          <button
            type="button"
            className="w-full rounded-md border border-rose-200 bg-rose-50 py-1.5 font-semibold text-rose-800"
            onClick={() => deleteSelectedNode(routing, selectedNode, setSelectedNodeUuid)}
          >
            Usuń punkt
          </button>
        </div>
      )}

      {selectedEdge && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-2">
          <div className="font-semibold">Odcinek</div>
          <div className="text-[10px] text-slate-500">
            {nodeDisplayName(
              routing.nodes.find((n) => n.uuid === selectedEdge.from_node_uuid) ??
                ({ uuid: "", warehouse_id: 0, x: 0, y: 0, node_type: "junction" } as RoutingNode),
              routing.accessPoints,
              locations
            )}
            {" → "}
            {nodeDisplayName(
              routing.nodes.find((n) => n.uuid === selectedEdge.to_node_uuid) ??
                ({ uuid: "", warehouse_id: 0, x: 0, y: 0, node_type: "junction" } as RoutingNode),
              routing.accessPoints,
              locations
            )}
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
                routing.updateEdge(selectedEdge.uuid, { cost_multiplier: Number(e.target.value) || 1 })
              }
            />
          </label>
          <div className="text-[10px] text-slate-500">
            Dystans: {selectedEdge.distance_m.toFixed(2)} m
          </div>

          <div className="rounded border border-slate-100 bg-slate-50/80 p-2">
            <button
              type="button"
              className="flex w-full items-center justify-between font-semibold"
              onClick={() => setEdgeRestrictionsOpen((v) => !v)}
            >
              Ograniczenia
              <span className="text-[10px] font-normal text-slate-500">
                {edgeRestrictionsOpen ? "ukryj" : "opcjonalne"}
              </span>
            </button>
            {!edgeRestrictionsOpen && (
              <p className="mt-1 text-[10px] text-slate-500">
                {!selectedEdge.allowed_processes?.length &&
                !selectedEdge.allowed_transport_types?.length
                  ? "Dostępny dla wszystkich procesów i środków transportu"
                  : [
                      selectedEdge.allowed_processes?.length
                        ? `Procesy: ograniczone (${selectedEdge.allowed_processes.length})`
                        : "Wszystkie procesy",
                      selectedEdge.allowed_transport_types?.length
                        ? `Transport: ograniczony (${selectedEdge.allowed_transport_types.length})`
                        : "Wszystkie środki",
                    ].join(" · ")}
              </p>
            )}
            {edgeRestrictionsOpen && (
              <div className="mt-2 space-y-2">
                <p className="text-[10px] text-slate-500">
                  Puste = bez ograniczenia (domyślna wspólna sieć).
                </p>
                <label className="block">
                  Tylko wybrane procesy
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
                  Wyczyść → wszystkie procesy
                </button>
                <label className="block">
                  Tylko wybrany transport
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
                  Wyczyść → wszystkie środki transportu
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="text-rose-700 underline"
            onClick={() => {
              if (!window.confirm("Usunąć odcinek?")) return;
              routing.removeEdge(selectedEdge.uuid);
              setSelectedEdgeUuid(null);
            }}
          >
            Usuń odcinek
          </button>
        </div>
      )}

      <div className="mt-auto space-y-2 border-t border-slate-100 pt-2">
        <div className="text-[10px] text-slate-400">
          Węzły: {routing.nodes.length} · Odcinki: {routing.edges.length} · Dostępy:{" "}
          {routing.accessPoints.length} · Operacyjne: {opCount}
        </div>
        <button
          type="button"
          className="w-full rounded-md border border-rose-300 py-1.5 text-[11px] font-semibold text-rose-800"
          disabled={routing.nodes.length === 0 && routing.edges.length === 0}
          onClick={() => {
            const ok = window.confirm(
              `Wyczyścić całą sieć tras?\n\n` +
                `• Punkty (węzły): ${routing.nodes.length}\n` +
                `• Odcinki: ${routing.edges.length}\n` +
                `• Dostępy do lokalizacji: ${routing.accessPoints.length}\n` +
                `• Punkty operacyjne: ${opCount}\n\n` +
                `Tej operacji nie cofniesz bez ponownego wczytania (dopóki nie zapiszesz).`
            );
            if (!ok) return;
            routing.clearGraph();
            setSelectedNodeUuid(null);
            setSelectedEdgeUuid(null);
            setTestStartUuid(null);
            setTestDestUuid(null);
          }}
        >
          Wyczyść sieć tras
        </button>
      </div>
    </aside>
  );
}

/** Exported for keyboard Delete handler in designer. */
export { deleteSelectedNode };
