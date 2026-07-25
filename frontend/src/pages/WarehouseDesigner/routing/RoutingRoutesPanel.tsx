import { useMemo, useState } from "react";
import type { RoutingNode } from "../../../api/warehouseRoutingApi";
import type { RackState } from "../../../types/warehouse";
import { nodeDisplayName, orphanNodeUuids } from "./routingDisplay";
import {
  ROUTING_PROCESS_OPTIONS,
  ROUTING_TRANSPORT_OPTIONS,
  type RoutingTool,
} from "./routingLabels";
import type { useRoutingGraph } from "./useRoutingGraph";
import { LocationAccessProblemsPanel } from "./LocationAccessProblemsPanel";
import type { AccessProblemItem } from "./locationAccessProblems";
import { NodeInspector } from "./NodeInspector";
import { EdgeInspector } from "./EdgeInspector";
import { PrimaryButton } from "../../../design-system/PrimaryButton";

export { deleteSelectedNode } from "./routingNodeActions";

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
  locations: { id: number; name: string; location_type?: string | null }[];
  racks?: RackState[];
  highlightOrphanUuids: string[];
  setHighlightOrphanUuids: (ids: string[]) => void;
  highlightInvalidEdgeUuids?: string[];
  setHighlightInvalidEdgeUuids?: (ids: string[]) => void;
  selectedAccessLocationId?: number | null;
  showAllAccessProblems?: boolean;
  onSelectAccessProblem?: (item: AccessProblemItem) => void;
  onToggleShowAllAccessProblems?: () => void;
  onClearAccessProblemSelection?: () => void;
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
  racks = [],
  highlightOrphanUuids,
  setHighlightOrphanUuids,
  highlightInvalidEdgeUuids = [],
  setHighlightInvalidEdgeUuids,
  selectedAccessLocationId = null,
  showAllAccessProblems = false,
  onSelectAccessProblem,
  onToggleShowAllAccessProblems,
  onClearAccessProblemSelection,
}: Props) {
  const [processType, setProcessType] = useState("");
  const [transportType, setTransportType] = useState("");
  const [testAdvanced, setTestAdvanced] = useState(false);

  const selectedNode = useMemo(
    () => routing.nodes.find((n) => n.uuid === selectedNodeUuid) ?? null,
    [routing.nodes, selectedNodeUuid]
  );
  const selectedEdge = useMemo(
    () => routing.edges.find((e) => e.uuid === selectedEdgeUuid) ?? null,
    [routing.edges, selectedEdgeUuid]
  );
  const orphans = useMemo(
    () => orphanNodeUuids(routing.nodes, routing.edges),
    [routing.nodes, routing.edges]
  );
  const opCount = routing.nodes.filter((n) => n.operational_type).length;

  const editingPoint = Boolean(selectedNode && (tool === "select" || tool === "edit"));
  const editingEdge = Boolean(selectedEdge && (tool === "select" || tool === "edit") && !selectedNode);
  const showIdle = !editingPoint && !editingEdge && tool !== "test_route";

  const nameOf = (n: RoutingNode) =>
    nodeDisplayName(n, routing.accessPoints, locations, routing.nodes, routing.edges);

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
            ["draw_edge", "Rysuj"],
            ["select", "Wybierz"],
            ["edit", "Edytuj"],
            ["test_route", "Testuj"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTool(id);
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
          Klikaj kolejne miejsca — odcinki i skrzyżowania powstają automatycznie, gdy drogi się
          przecinają lub łączą. Enter / Esc kończy bieżącą drogę.
        </p>
      )}
      {tool === "select" && (
        <p className="text-[11px] text-slate-600">
          Tylko zaznaczanie i podgląd — bez przesuwania punktów.
        </p>
      )}
      {tool === "edit" && (
        <p className="text-[11px] text-amber-900">
          Edycja grafu: przeciągaj punkty, scalaj / usuwaj, przepinaj końce odcinków. Bez edycji
          przejazdów (Projektowanie).
        </p>
      )}

      <div className="flex gap-2">
        <PrimaryButton
          type="button"
          disabled={routing.saving || !routing.dirty}
          onClick={() => void routing.save()}
          className="flex-1"
        >
          {routing.saving ? "Zapisywanie…" : "Zapisz sieć"}
        </PrimaryButton>
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

      {/* Validation — structural errors / warnings only (no vague „konfiguracja sieci”) */}
      {routing.validation && showIdle && (() => {
        const structural = routing.validation.issues.filter(
          (i) =>
            (i.severity === "error" || i.severity === "warning") &&
            i.code !== "LOCATIONS_ACCESS_OK" &&
            i.code !== "LOCATIONS_ACCESS_REVIEW" &&
            i.code !== "LOCATIONS_ACCESS_UNREACHABLE" &&
            i.code !== "LOCATIONS_ACCESS_OVERRIDE_BROKEN" &&
            i.code !== "LOCATIONS_WITHOUT_ACCESS"
        );
        const structuralBad = structural.some((i) => i.severity === "error");
        return (
          <>
            {structural.length > 0 && (
              <div className="space-y-2 rounded-lg border border-slate-200 p-2">
                <div className="font-semibold">
                  {structuralBad ? "Uwagi do sieci" : "Sieć — ostrzeżenia"}
                </div>
                <ul className="max-h-40 space-y-2 overflow-auto">
                  {structural.map((i, idx) => (
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
                      {i.code === "EDGES_THROUGH_OBSTACLES" &&
                        (i.ref_uuids?.length ?? 0) > 0 &&
                        setHighlightInvalidEdgeUuids && (
                          <div className="mt-1 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-800"
                              onClick={() => {
                                setHighlightInvalidEdgeUuids(i.ref_uuids ?? []);
                                const first = i.ref_uuids?.[0];
                                if (first) setSelectedEdgeUuid(first);
                              }}
                            >
                              Pokaż na mapie
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
                {highlightInvalidEdgeUuids.length > 0 && setHighlightInvalidEdgeUuids && (
                  <button
                    type="button"
                    className="ml-2 text-[10px] underline"
                    onClick={() => setHighlightInvalidEdgeUuids([])}
                  >
                    Wyłącz podświetlenie odcinków
                  </button>
                )}
              </div>
            )}
            {structural.length === 0 && routing.validation.operational_ready && (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-2 font-semibold text-emerald-800">
                Sieć w porządku
              </div>
            )}
            {structural.length === 0 && !routing.validation.operational_ready && (
              <div className="text-[10px] text-slate-500">Struktura sieci jest poprawna.</div>
            )}
          </>
        );
      })()}

      {showIdle &&
        onSelectAccessProblem &&
        onToggleShowAllAccessProblems &&
        onClearAccessProblemSelection && (
          <LocationAccessProblemsPanel
            locationAccess={routing.locationAccess}
            locations={locations}
            racks={racks}
            selectedLocationId={selectedAccessLocationId}
            showAllProblems={showAllAccessProblems}
            onSelectProblem={onSelectAccessProblem}
            onToggleShowAll={onToggleShowAllAccessProblems}
            onClearSelection={onClearAccessProblemSelection}
          />
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
              <PrimaryButton
                type="button"
                className="w-full"
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
              </PrimaryButton>
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

      {editingPoint && selectedNode && (
        <NodeInspector
          routing={routing}
          selectedNode={selectedNode}
          locations={locations}
          setSelectedNodeUuid={setSelectedNodeUuid}
          setSelectedEdgeUuid={setSelectedEdgeUuid}
          setTool={setTool}
          setHighlightOrphanUuids={setHighlightOrphanUuids}
        />
      )}

      {editingEdge && selectedEdge && (
        <EdgeInspector
          routing={routing}
          selectedEdge={selectedEdge}
          tool={tool}
          locations={locations}
          setSelectedEdgeUuid={setSelectedEdgeUuid}
        />
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
