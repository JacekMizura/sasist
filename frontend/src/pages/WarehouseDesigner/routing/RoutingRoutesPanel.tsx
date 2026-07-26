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
import {
  Card,
  CardButton,
  DangerButton,
  GhostButton,
  PrimaryButton,
  SecondaryButton,
  Select,
  Toolbar,
} from "../../../design-system";
import { WarehouseRailSection } from "../../../components/warehouse/WarehouseLeftRail";

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
        orphans.length === 1
          ? "Usunąć 1 niepołączony punkt?"
          : `Usunąć ${n} niepołączonych punktów?`
      )
    ) {
      return;
    }
    routing.removeOrphanNodes();
    setSelectedNodeUuid(null);
    setHighlightOrphanUuids([]);
  };

  return (
    <div className="text-[12px] text-slate-700">
      <WarehouseRailSection title="Sieć tras" />

      <WarehouseRailSection title="Narzędzia">
        <Toolbar
          start={
            (
              [
                ["draw_edge", "Rysuj"],
                ["select", "Wybierz"],
                ["edit", "Edytuj"],
                ["test_route", "Testuj"],
              ] as const
            ).map(([id, label]) => (
              <CardButton
                key={id}
                density="compact"
                active={tool === id}
                onClick={() => {
                  setTool(id);
                }}
              >
                {label}
              </CardButton>
            ))
          }
        />
      </WarehouseRailSection>

      <WarehouseRailSection>
        <Toolbar
          start={
            <>
              <PrimaryButton
                type="button"
                disabled={routing.saving || !routing.dirty}
                onClick={() => void routing.save()}
                className="flex-1"
              >
                {routing.saving ? "Zapisywanie…" : "Zapisz"}
              </PrimaryButton>
              <SecondaryButton
                density="compact"
                onClick={() => void routing.runValidate()}
                className="flex-1"
              >
                Sprawdź sieć
              </SecondaryButton>
            </>
          }
        />
      </WarehouseRailSection>

      {routing.error && (
        <div className="mb-3 rounded-md bg-rose-50 px-2 py-1 text-rose-700">
          {routing.error}
          <GhostButton density="compact" className="ml-2" onClick={() => void routing.load()}>
            Odśwież
          </GhostButton>
        </div>
      )}
      {routing.dirty && <div className="mb-3 text-amber-700">Niezapisane zmiany</div>}

      {showIdle && (
        <div className="mb-3 text-[11px] text-slate-500">
          {routing.nodes.length} punktów · {routing.edges.length} odcinków
          {orphans.length > 0 && (
            <Card variant="section" density="compact" className="mt-2 space-y-2 border-amber-200 bg-amber-50 text-amber-900">
              {routing.edges.length === 0
                ? `${orphans.length} niepołączonych punktów.`
                : orphans.length === 1
                  ? "1 punkt niepołączony."
                  : `${orphans.length} punktów niepołączonych.`}
              <PrimaryButton
                intent="warning"
                density="compact"
                className="w-full"
                onClick={removeOrphansAction}
              >
                Usuń niepołączone punkty
              </PrimaryButton>
            </Card>
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
              <WarehouseRailSection title={structuralBad ? "Uwagi do sieci" : "Sieć — ostrzeżenia"}>
              <Card variant="section" density="compact" className="space-y-2">
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
                            <SecondaryButton
                              density="compact"
                              onClick={() =>
                                setHighlightOrphanUuids(i.ref_uuids?.length ? i.ref_uuids : orphans)
                              }
                            >
                              Podświetl na mapie
                            </SecondaryButton>
                            <DangerButton density="compact" onClick={removeOrphansAction}>
                              Usuń niepołączone punkty
                            </DangerButton>
                          </div>
                        )}
                      {i.code === "EDGES_THROUGH_OBSTACLES" &&
                        (i.ref_uuids?.length ?? 0) > 0 &&
                        setHighlightInvalidEdgeUuids && (
                          <div className="mt-1 flex flex-wrap gap-2">
                            <DangerButton
                              density="compact"
                              onClick={() => {
                                setHighlightInvalidEdgeUuids(i.ref_uuids ?? []);
                                const first = i.ref_uuids?.[0];
                                if (first) setSelectedEdgeUuid(first);
                              }}
                            >
                              Pokaż na mapie
                            </DangerButton>
                          </div>
                        )}
                    </li>
                  ))}
                </ul>
                {highlightOrphanUuids.length > 0 && (
                  <GhostButton density="compact" onClick={() => setHighlightOrphanUuids([])}>
                    Wyłącz podświetlenie
                  </GhostButton>
                )}
                {highlightInvalidEdgeUuids.length > 0 && setHighlightInvalidEdgeUuids && (
                  <GhostButton
                    density="compact"
                    className="ml-2"
                    onClick={() => setHighlightInvalidEdgeUuids([])}
                  >
                    Wyłącz podświetlenie odcinków
                  </GhostButton>
                )}
              </Card>
              </WarehouseRailSection>
            )}
            {structural.length === 0 && routing.validation.operational_ready && (
              <Card variant="section" density="compact" className="mb-3 border-emerald-100 bg-emerald-50/50 font-semibold text-emerald-800">
                Sieć w porządku
              </Card>
            )}
            {structural.length === 0 && !routing.validation.operational_ready && (
              <div className="mb-3 text-[10px] text-slate-500">Struktura sieci jest poprawna.</div>
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
        <WarehouseRailSection title="Testuj trasę">
        <Card variant="section" density="compact" className="space-y-2 border-sky-100 bg-sky-50/60">
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
                <Select
                  density="compact"
                  className="mt-0.5"
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
                </Select>
              </label>
              <label className="block">
                Cel
                <Select
                  density="compact"
                  className="mt-0.5"
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
                </Select>
              </label>
            </div>
          </details>
          <GhostButton density="compact" onClick={() => setTestAdvanced((v) => !v)}>
            {testAdvanced ? "Ukryj zaawansowane" : "Zaawansowane ustawienia"}
          </GhostButton>
          {testAdvanced && (
            <div className="space-y-2 border-t border-sky-100 pt-2">
              <label className="block">
                Proces (opcjonalnie)
                <Select
                  density="compact"
                  className="mt-0.5"
                  value={processType}
                  onChange={(e) => setProcessType(e.target.value)}
                >
                  <option value="">bez ograniczenia</option>
                  {ROUTING_PROCESS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                Transport (opcjonalnie)
                <Select
                  density="compact"
                  className="mt-0.5"
                  value={transportType}
                  onChange={(e) => setTransportType(e.target.value)}
                >
                  <option value="">bez ograniczenia</option>
                  {ROUTING_TRANSPORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
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
        </Card>
        </WarehouseRailSection>
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
        <WarehouseRailSection separated>
          <DangerButton
            density="compact"
            className="w-full"
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
          </DangerButton>
        </WarehouseRailSection>
      )}
    </div>
  );
}
