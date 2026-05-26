import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Layers, Plus } from "lucide-react";
import {
  bulkDeleteDocumentSeries,
  deleteDocumentSeries,
  listDocumentSeries,
  type DocumentSeriesDto,
} from "../../api/documentSeriesApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { readDocumentsSeriesListContext } from "./documentSeriesContext";
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
import {
  DocumentsFiltersToolbar,
  DocumentsKpiRow,
  DocumentsTableCard,
  documentsTableTheadCls,
} from "./documentsDashboardPrimitives";

export default function DocumentSeriesListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const tenantId = DAMAGE_TENANT_ID;

  const listContext = useMemo(() => readDocumentsSeriesListContext(), [location.pathname, location.key]);

  const [rows, setRows] = useState<DocumentSeriesDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      if (listContext.type != null && r.type !== listContext.type) return false;
      if (listContext.subtype && r.subtype !== listContext.subtype) return false;
      return true;
    });
  }, [rows, listContext.type, listContext.subtype]);

  const seriesKpi = useMemo(
    () => [
      { label: "Serie (widok)", value: visibleRows.length },
      { label: "W magazynie", value: rows.length },
      { label: "Zaznaczono", value: selected.size, tone: "blue" as const },
      {
        label: "Magazyn",
        value: (warehouse?.name || "").trim() || "—",
        tone: "slate" as const,
      },
    ],
    [visibleRows.length, rows.length, selected.size, warehouse?.name],
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
      <DocumentsSectionShell title="Serie dokumentów" subtitle="Numeracja i szablony druku dla faktur, paragonów i dokumentów magazynowych.">
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
        subtitle="Prefiksy, numeracja, VAT i powiązania z szablonami druku — jeden widok operacyjny."
        actions={
          <button
            type="button"
            onClick={() => navigate("/documents/series/new")}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            Utwórz serię
          </button>
        }
        kpi={<DocumentsKpiRow items={seriesKpi} />}
        toolbar={
          <DocumentsFiltersToolbar>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={visibleRows.length === 0} />
              Zaznacz wszystkie
            </label>
            <button
              type="button"
              disabled={selected.size === 0 || bulkBusy}
              onClick={() => void onBulkDelete()}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
            >
              {bulkBusy ? "…" : `Usuń zaznaczone (${selected.size})`}
            </button>
            {loading ? (
              <span className="ml-auto text-xs font-medium text-slate-500">Ładowanie…</span>
            ) : (
              <span className="ml-auto hidden text-xs text-slate-400 sm:inline">Wybór z lewego menu filtruje kontekst.</span>
            )}
          </DocumentsFiltersToolbar>
        }
      >
        {err ? (
          <p className="mb-4 rounded-lg border border-red-100 bg-red-50/90 px-4 py-2.5 text-sm text-red-700">{err}</p>
        ) : null}

        <DocumentsTableCard>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[72rem] text-left text-sm">
            <thead className={`text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${documentsTableTheadCls}`}>
              <tr>
                <th className="w-10 p-3" />
                <th className="p-3">Nazwa</th>
                <th className="p-3">Prefiks</th>
                <th className="p-3">Typ</th>
                <th className="p-3">Podtyp</th>
                <th className="p-3">VAT</th>
                <th className="p-3">Szablon druku</th>
                <th className="p-3">Efekt mag.</th>
                <th className="p-3">Numeracja</th>
                <th className="p-3">Usuwanie</th>
                <th className="w-28 p-3" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={11} className="p-0">
                    <DocumentsEmptyState
                      icon={Layers}
                      title="Brak serii w tym kontekście"
                      description="Dodaj pierwszą serię numeracyjną dla tego magazynu — zdefiniuj prefiks, typ dokumentu i powiązanie z szablonem druku."
                      action={
                        <button
                          type="button"
                          onClick={() => navigate("/documents/series/new")}
                          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                        >
                          <Plus className="h-4 w-4 shrink-0" aria-hidden />
                          Utwórz serię
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                visibleRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 transition-colors odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/80"
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Zaznacz ${r.name}`}
                      />
                    </td>
                    <td className="p-3 font-medium text-slate-900">{r.name}</td>
                    <td className="p-3 font-mono text-xs text-slate-700">{r.prefix || "—"}</td>
                    <td className="p-3">{documentSeriesTypeLabelPl(r.type)}</td>
                    <td className="p-3">{documentSeriesSubtypeLabelPl(r.subtype)}</td>
                    <td className="p-3 text-xs">{vatColumnSummaryPl(r)}</td>
                    <td className="max-w-[12rem] truncate p-3 text-xs" title={printTemplateSummaryPl(r)}>
                      {printTemplateSummaryPl(r)}
                    </td>
                    <td className="p-3">{r.warehouse_effect ? "tak" : "nie"}</td>
                    <td className="p-3 text-xs text-slate-800">{numberingSummaryForListRow(r)}</td>
                    <td className="p-3 text-xs">{deleteModeLabelPl(r.delete_mode)}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/documents/series/${r.id}`)}
                        className="mr-2 text-blue-700 hover:underline"
                      >
                        Edytuj
                      </button>
                      <button type="button" onClick={() => void onDeleteOne(r.id)} className="text-red-700 hover:underline">
                        Usuń
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </DocumentsTableCard>
      </DocumentsSectionShell>
    </>
  );
}
