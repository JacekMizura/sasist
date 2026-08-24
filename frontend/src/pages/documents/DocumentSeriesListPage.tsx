import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import {
  bulkDeleteDocumentSeries,
  deleteDocumentSeries,
  listDocumentSeries,
  type DocumentSeriesDto,
} from "../../api/documentSeriesApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { clearDocumentsSeriesListContext } from "./documentSeriesContext";
import {
  deleteModeLabelPl,
  documentSeriesSubtypeLabelPl,
  documentSeriesTypeLabelPl,
  numberingSummaryForListRow,
} from "./documentSeriesUiLabels";
import DocumentsEmptyState from "./DocumentsEmptyState";
import { DocumentsSectionShell } from "./DocumentsSectionShell";
import { DocumentSeriesEditorPanel } from "./components/seriesEditor/DocumentSeriesEditorPanel";
import { OperationalActionButton, OperationalActionLink } from "../../components/operational";
import {
  moduleBulkDangerBtnClass,
  moduleListRowClass,
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
  moduleTableCardClass,
} from "../../components/listPage/moduleList";
import { DocumentsKpiRow } from "./documentsDashboardPrimitives";
import { PrimaryButton } from "../../design-system";

function parseSeriesRoute(pathname: string): { isCreate: boolean; seriesId: string | null; editorOpen: boolean } {
  const path = pathname.replace(/\/+$/, "");
  if (path.endsWith("/documents/series/new")) {
    return { isCreate: true, seriesId: null, editorOpen: true };
  }
  const m = path.match(/\/documents\/series\/([^/]+)$/);
  if (m && m[1] && m[1] !== "new") {
    return { isCreate: false, seriesId: m[1], editorOpen: true };
  }
  return { isCreate: false, seriesId: null, editorOpen: false };
}

export default function DocumentSeriesListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const tenantId = DAMAGE_TENANT_ID;
  const route = parseSeriesRoute(location.pathname);

  const [rows, setRows] = useState<DocumentSeriesDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const visibleRows = rows;

  const seriesKpi = useMemo(
    () => [
      { label: "Serie w magazynie", value: rows.length },
      {
        label: "Magazynowe",
        value: rows.filter((r) => r.type === "WAREHOUSE").length,
        tone: "blue" as const,
      },
      { label: "Zaznaczono", value: selected.size, tone: "slate" as const },
      {
        label: "Magazyn",
        value: (warehouse?.name || "").trim() || "—",
        tone: "slate" as const,
      },
    ],
    [rows, selected.size, warehouse?.name],
  );

  useEffect(() => {
    const st = (location.state as { documentSeriesCreatedToast?: string } | null)?.documentSeriesCreatedToast;
    if (st) {
      setToast(st);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const list = await listDocumentSeries(tenantId, warehouseId);
      setRows(list);
      setSelected(new Set());
    } catch {
      setErr("Nie udało się wczytać serii dokumentów.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    clearDocumentsSeriesListContext();
    void load();
  }, [load]);

  const refreshListQuiet = useCallback(async () => {
    if (warehouseId == null) return;
    try {
      const list = await listDocumentSeries(tenantId, warehouseId);
      setRows(list);
    } catch {
      /* keep existing rows */
    }
  }, [tenantId, warehouseId]);

  const allSelected = useMemo(
    () => visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id)),
    [visibleRows, selected],
  );

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(visibleRows.map((r) => r.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const onBulkDelete = async () => {
    if (warehouseId == null || selected.size === 0) return;
    if (!window.confirm(`Usunąć ${selected.size} serii?`)) return;
    setBulkBusy(true);
    setErr(null);
    try {
      await bulkDeleteDocumentSeries(tenantId, warehouseId, Array.from(selected));
      await load();
    } catch {
      setErr("Nie udało się usunąć zaznaczonych serii.");
    } finally {
      setBulkBusy(false);
    }
  };

  const onDeleteOne = async (id: string) => {
    if (warehouseId == null) return;
    if (!window.confirm("Usunąć tę serię?")) return;
    setErr(null);
    try {
      await deleteDocumentSeries(id, tenantId, warehouseId);
      if (route.seriesId === id) navigate("/documents/series");
      await load();
    } catch {
      setErr("Nie udało się usunąć serii.");
    }
  };

  const openCreate = () => navigate("/documents/series/new");
  const openEdit = (id: string) => navigate(`/documents/series/${id}`);
  const closeEditor = () => navigate("/documents/series");

  const onEditorSaved = (saved: DocumentSeriesDto, mode: "create" | "update") => {
    void refreshListQuiet();
    if (mode === "create") {
      setToast("Utworzono serię dokumentów.");
      navigate(`/documents/series/${saved.id}`, { replace: true });
    }
  };

  if (warehouseId == null) {
    return (
      <DocumentsSectionShell title="Serie dokumentów">
        <DocumentsEmptyState
          icon={Layers}
          title="Wybierz magazyn"
          description="Serie dokumentów są przypisane do magazynu. Ustaw aktywny magazyn w nagłówku aplikacji, aby wczytać listę."
        />
      </DocumentsSectionShell>
    );
  }

  const listPane = (
    <div
      className={`flex min-h-0 min-w-0 flex-col ${route.editorOpen ? "w-full lg:w-[44%] lg:max-w-[46%] lg:shrink-0" : "w-full"}`}
      data-testid="document-series-list-pane"
    >
      <DocumentsSectionShell
        title="Serie dokumentów"
        actions={
          <PrimaryButton type="button" density="compact" onClick={openCreate} data-testid="document-series-create">
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            Utwórz serię
          </PrimaryButton>
        }
        kpi={<DocumentsKpiRow items={seriesKpi} />}
        toolbar={
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-white px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={visibleRows.length === 0} />
              Zaznacz wszystkie
            </label>
            <button
              type="button"
              disabled={selected.size === 0 || bulkBusy}
              onClick={() => void onBulkDelete()}
              className={moduleBulkDangerBtnClass}
            >
              {bulkBusy ? "…" : `Usuń zaznaczone (${selected.size})`}
            </button>
            {loading ? (
              <span className="ml-auto text-xs font-medium text-slate-500">Ładowanie…</span>
            ) : (
              <span className="ml-auto hidden text-xs text-slate-400 sm:inline">
                Wszystkie serie operacyjne dla wybranego magazynu.
              </span>
            )}
          </div>
        }
      >
        {err ? (
          <p className="mb-4 rounded-lg border border-red-100 bg-red-50/90 px-4 py-2.5 text-sm text-red-700">{err}</p>
        ) : null}

        <div className={moduleTableCardClass}>
          <div className={moduleListTableScrollClass}>
            <table
              className={moduleListTableClass}
              style={{ minWidth: route.editorOpen ? "42rem" : "56rem" }}
              data-testid="document-series-table"
            >
              <thead className={moduleListTheadClass}>
                <tr>
                  <th className={`${moduleListThClass} w-10`} />
                  <th className={moduleListThClass}>Nazwa</th>
                  <th className={moduleListThClass}>Prefiks</th>
                  <th className={moduleListThClass}>Typ</th>
                  <th className={moduleListThClass}>Podtyp</th>
                  <th className={moduleListThClass}>Numeracja</th>
                  <th className={moduleListThClass}>Efekt mag.</th>
                  <th className={moduleListThClass}>Usuwanie</th>
                  <th className={`${moduleListThClass} w-20 text-right`}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={9} className="p-0">
                      <DocumentsEmptyState
                        icon={Layers}
                        title="Brak serii w magazynie"
                        description="Dodaj serie numeracyjne (FV, PA, KOR, PZ, WZ, MM, RW, PW) — zdefiniuj prefiks, typ dokumentu i powiązanie z szablonem druku."
                        action={
                          <PrimaryButton type="button" density="compact" onClick={openCreate}>
                            <Plus className="h-4 w-4 shrink-0" aria-hidden />
                            Utwórz serię
                          </PrimaryButton>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((r) => {
                    const isActiveRow = route.seriesId === r.id;
                    return (
                      <tr
                        key={r.id}
                        className={`${moduleListRowClass} ${isActiveRow ? "bg-orange-50/60" : ""}`}
                        data-testid={`document-series-row-${r.id}`}
                      >
                        <td className={`${moduleListTdClass} px-2`}>
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleOne(r.id)}
                            aria-label={`Zaznacz ${r.name}`}
                          />
                        </td>
                        <td className={`${moduleListTdClass} px-2 font-medium text-slate-900`}>
                          <button
                            type="button"
                            className="text-left hover:text-orange-600 hover:underline"
                            onClick={() => openEdit(r.id)}
                            data-testid={`document-series-open-${r.id}`}
                          >
                            {r.name}
                          </button>
                        </td>
                        <td className={`${moduleListTdClass} px-2 font-mono text-xs text-slate-700`}>{r.prefix || "—"}</td>
                        <td className={`${moduleListTdClass} px-2`}>{documentSeriesTypeLabelPl(r.type)}</td>
                        <td className={`${moduleListTdClass} px-2`}>{documentSeriesSubtypeLabelPl(r.subtype)}</td>
                        <td className={`${moduleListTdClass} px-2 text-xs text-slate-800`}>
                          {numberingSummaryForListRow(r)}
                        </td>
                        <td className={`${moduleListTdClass} px-2`}>{r.warehouse_effect ? "tak" : "nie"}</td>
                        <td className={`${moduleListTdClass} px-2 text-xs`}>{deleteModeLabelPl(r.delete_mode)}</td>
                        <td className={`${moduleListTdClass} px-2`}>
                          <div className="flex items-center justify-end gap-1">
                            <OperationalActionLink
                              to={`/documents/series/${r.id}`}
                              title="Edytuj serię"
                              aria-label="Edytuj serię"
                            >
                              <Pencil strokeWidth={2} aria-hidden />
                            </OperationalActionLink>
                            <OperationalActionButton
                              variant="danger"
                              title="Usuń serię"
                              aria-label="Usuń serię"
                              onClick={() => void onDeleteOne(r.id)}
                            >
                              <Trash2 strokeWidth={2} aria-hidden />
                            </OperationalActionButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DocumentsSectionShell>
    </div>
  );

  return (
    <>
      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[90] max-w-lg -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-950 shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <div
        className={`flex min-h-0 w-full ${route.editorOpen ? "flex-col lg:h-[calc(100vh-8.5rem)] lg:flex-row lg:overflow-hidden" : ""}`}
        data-testid="document-series-workspace"
      >
        {listPane}
        {route.editorOpen ? (
          <div className="min-h-[28rem] min-w-0 flex-1 lg:min-h-0" data-testid="document-series-editor-pane">
            <DocumentSeriesEditorPanel
              key={route.isCreate ? "create" : route.seriesId ?? "edit"}
              seriesId={route.seriesId}
              isCreate={route.isCreate}
              onClose={closeEditor}
              onSaved={onEditorSaved}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
