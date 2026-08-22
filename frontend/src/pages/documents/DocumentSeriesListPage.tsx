import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
  printTemplateSummaryPl,
  vatColumnSummaryPl,
} from "./documentSeriesUiLabels";
import DocumentsEmptyState from "./DocumentsEmptyState";
import { DocumentsSectionShell } from "./DocumentsSectionShell";
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

export default function DocumentSeriesListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const tenantId = DAMAGE_TENANT_ID;

  const [rows, setRows] = useState<DocumentSeriesDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /** Master list — always all series for the warehouse (not sidebar tab context). */
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
      await load();
    } catch {
      setErr("Nie udało się usunąć serii.");
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

      <DocumentsSectionShell
        title="Serie dokumentów"
        actions={
          <PrimaryButton type="button" density="compact" onClick={() => navigate("/documents/series/new")}>
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            Utwórz serię
          </PrimaryButton>
        }
        kpi={<DocumentsKpiRow items={seriesKpi} />}
        toolbar={
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
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
            <table className={moduleListTableClass} style={{ minWidth: "72rem" }}>
              <thead className={moduleListTheadClass}>
                <tr>
                  <th className={`${moduleListThClass} w-10`} />
                  <th className={moduleListThClass}>Nazwa</th>
                  <th className={moduleListThClass}>Prefiks</th>
                  <th className={moduleListThClass}>Typ</th>
                  <th className={moduleListThClass}>Podtyp</th>
                  <th className={moduleListThClass}>VAT</th>
                  <th className={moduleListThClass}>Szablon druku</th>
                  <th className={moduleListThClass}>Efekt mag.</th>
                  <th className={moduleListThClass}>Numeracja</th>
                  <th className={moduleListThClass}>Usuwanie</th>
                  <th className={`${moduleListThClass} w-24 text-right`}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={11} className="p-0">
                      <DocumentsEmptyState
                        icon={Layers}
                        title="Brak serii w magazynie"
                        description="Dodaj serie numeracyjne (FV, PA, KOR, PZ, WZ, MM, RW, PW) — zdefiniuj prefiks, typ dokumentu i powiązanie z szablonem druku."
                        action={
                          <PrimaryButton type="button" density="compact" onClick={() => navigate("/documents/series/new")}>
                            <Plus className="h-4 w-4 shrink-0" aria-hidden />
                            Utwórz serię
                          </PrimaryButton>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((r) => (
                    <tr key={r.id} className={moduleListRowClass}>
                      <td className={moduleListTdClass}>
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                          aria-label={`Zaznacz ${r.name}`}
                        />
                      </td>
                      <td className={`${moduleListTdClass} font-medium text-slate-900`}>{r.name}</td>
                      <td className={`${moduleListTdClass} font-mono text-xs text-slate-700`}>{r.prefix || "—"}</td>
                      <td className={moduleListTdClass}>{documentSeriesTypeLabelPl(r.type)}</td>
                      <td className={moduleListTdClass}>{documentSeriesSubtypeLabelPl(r.subtype)}</td>
                      <td className={`${moduleListTdClass} text-xs`}>{vatColumnSummaryPl(r)}</td>
                      <td className={`${moduleListTdClass} max-w-[12rem] truncate text-xs`} title={printTemplateSummaryPl(r)}>
                        {printTemplateSummaryPl(r)}
                      </td>
                      <td className={moduleListTdClass}>{r.warehouse_effect ? "tak" : "nie"}</td>
                      <td className={`${moduleListTdClass} text-xs text-slate-800`}>{numberingSummaryForListRow(r)}</td>
                      <td className={`${moduleListTdClass} text-xs`}>{deleteModeLabelPl(r.delete_mode)}</td>
                      <td className={moduleListTdClass}>
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DocumentsSectionShell>
    </>
  );
}
