import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { ClipboardList } from "lucide-react";
import { fetchTenantsList } from "../../api/tenantsApi";
import {
  deleteStockDocument,
  duplicateStockDocument,
  listStockDocuments,
  type StockDocumentListRow,
} from "../../api/stockDocumentsApi";
import { formatMoneyPl } from "../../utils/formatOrderMoney";
import { useDocumentTemplatePrint } from "../../hooks/useDocumentTemplatePrint";
import { stockKindFromType } from "../../utils/documentTemplatePrint";
import {
  ErpBulkPrintModal,
  stockBulkDocumentType,
} from "../../components/documentTemplates/ErpBulkPrintModal";
import { DataTablePageSizeSelect } from "../../components/table/DataTablePageSizeSelect";
import WarehouseDocumentsTable from "./WarehouseDocumentsTable";
import { WarehouseZPzDocumentPage } from "./WarehouseZPzDocumentPage";
import { detailPath, legacyWarehouseDocumentRedirect } from "./warehouseDocumentRoutePaths";
import { getWarehouseDocumentConfig } from "./warehouseDocumentConfigs";
import { listValueGross, listValueNet } from "./warehouseDocumentHelpers";
import {
  normalizeWarehouseDocType,
  type DocumentTypeFilterTab,
  type WarehouseDocumentType,
} from "./warehouseDocumentsUi";
import DocumentsEmptyState from "./DocumentsEmptyState";
import { DocumentsSectionShell } from "./DocumentsSectionShell";
import {
  DocumentsFiltersToolbar,
  DocumentsKpiRow,
  DocumentsTableCard,
  documentsTableSelectCls,
} from "./documentsDashboardPrimitives";
import { useOperationalDocumentSeries } from "./OperationalDocumentSeriesContext";
import { Z_WAREHOUSE_DOC_CONFIRM, Z_WAREHOUSE_DOC_TOAST } from "./warehouseDocumentOverlayLayers";

type Tenant = { id: number; name: string };
const WAREHOUSE_DOCS_PAGE_SIZE_KEY = "warehouse_docs.pageSize";

function fmtMoney(n: number) {
  return formatMoneyPl(n);
}

export default function DocumentsWarehousePage() {
  const { docSegment } = useParams<{ docSegment: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { sessionReady } = useAuth();
  const { warehouse, warehousesLoading } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { warehouseTypes, firstWarehousePath, loading: seriesLoading, hasWarehouseType } = useOperationalDocumentSeries();

  const routeType = useMemo((): WarehouseDocumentType | null => {
    const seg = String(docSegment ?? "").trim().toLowerCase();
    if (!seg) return null;
    const hit = warehouseTypes.find((t) => (t.route_segment || "").toLowerCase() === seg);
    if (!hit?.stock_document_type) return null;
    return normalizeWarehouseDocType(hit.stock_document_type);
  }, [docSegment, warehouseTypes]);

  const zPzPageId = useMemo(() => {
    if (routeType !== "Z_PZ") return null;
    const raw = searchParams.get("id");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [routeType, searchParams]);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState<number | null>(null);
  const resolvedTenantId = tenantId ?? 1;
  const { requestPrint: requestStockDocumentPrint, pickerModal: stockDocumentPickerModal } = useDocumentTemplatePrint({
    tenantId: resolvedTenantId,
  });
  const [docTab, setDocTab] = useState<DocumentTypeFilterTab>(() => routeType ?? "PZ");
  const [rows, setRows] = useState<StockDocumentListRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const raw = localStorage.getItem(WAREHOUSE_DOCS_PAGE_SIZE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 25;
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);
  const [printMenuOpenId, setPrintMenuOpenId] = useState<number | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set());
  const [bulkPrintOpen, setBulkPrintOpen] = useState(false);

  useEffect(() => {
    if (routeType) setDocTab(routeType);
  }, [routeType]);

  useEffect(() => {
    localStorage.setItem(WAREHOUSE_DOCS_PAGE_SIZE_KEY, String(pageSize));
  }, [pageSize]);

  useEffect(() => {
    void fetchTenantsList()
      .then((list) => {
        setTenants(list);
        if (list.length > 0) {
          setTenantId((prev) => {
            if (prev != null && list.some((t) => t.id === prev)) return prev;
            return list[0].id;
          });
        } else {
          setTenantId(1);
        }
      })
      .catch(() => {
        setTenants([]);
        setTenantId(1);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load tenants once on mount
  }, []);

  const load = useCallback(async () => {
    if (!sessionReady || warehousesLoading || warehouseId == null || tenantId == null) {
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      setRows(
        await listStockDocuments(tenantId, {
          document_type: docTab,
          warehouse_id: warehouseId,
        }),
      );
    } catch {
      setErr("Nie udało się wczytać dokumentów.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, docTab, warehouseId, sessionReady, warehousesLoading]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tenantId, docTab]);

  useEffect(() => {
    if (!toastText) return;
    const t = window.setTimeout(() => setToastText(null), 4000);
    return () => window.clearTimeout(t);
  }, [toastText]);

  useEffect(() => {
    if (printMenuOpenId == null) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (el.closest("[data-print-menu-root]")) return;
      if (el.closest("[data-wh-doc-floating-menu]")) return;
      setPrintMenuOpenId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [printMenuOpenId]);

  useEffect(() => {
    if (deleteConfirmId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleteBusy) {
        e.stopPropagation();
        setDeleteConfirmId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteConfirmId, deleteBusy]);

  const goToDetail = useCallback(
    (id: number) => {
      if (docTab === "Z_PZ" || routeType === "Z_PZ") {
        navigate(`/documents/warehouse/z-pz?id=${id}`);
        return;
      }
      const segment = String(docSegment ?? "").trim().toLowerCase();
      if (segment) {
        navigate(detailPath(segment, id));
      }
    },
    [docTab, routeType, docSegment, navigate],
  );

  const confirmDeleteDocument = useCallback(async () => {
    if (deleteConfirmId == null) return;
    const id = deleteConfirmId;
    setDeleteBusy(true);
    try {
      await deleteStockDocument(resolvedTenantId, id);
      setDeleteConfirmId(null);
      setRows((prev) => prev.filter((r) => r.id !== id));
      void load();
    } catch {
      setToastText("Błąd podczas usuwania dokumentu");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteConfirmId, resolvedTenantId, load]);

  const openDocumentPdf = (id: number) => {
    const kindCode = stockKindFromType(docTab);
    void requestStockDocumentPrint({ kind: "stock_document", documentId: id, kindCode }, { autoPrint: false });
  };

  const printDocumentPdf = (id: number) => {
    const kindCode = stockKindFromType(docTab);
    void requestStockDocumentPrint({ kind: "stock_document", documentId: id, kindCode });
  };

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const listConfig = useMemo(() => getWarehouseDocumentConfig(docTab), [docTab]);

  const docTypeTitle = useMemo(() => {
    const seg = String(docSegment ?? "").trim().toLowerCase();
    const hit = warehouseTypes.find((t) => (t.route_segment || "").toLowerCase() === seg);
    if (hit?.operational_code) return hit.operational_code;
    if (docTab === "Z_PZ") return "Z-PZ";
    return docTab;
  }, [docSegment, warehouseTypes, docTab]);

  const warehouseKpi = useMemo(() => {
    const total = rows.length;
    const drafts = rows.filter((r) => r.status === "draft").length;
    const posted = rows.filter((r) => ["posted", "completed", "done"].includes(String(r.status).toLowerCase())).length;
    let valueSum = 0;
    for (const r of rows) {
      const v =
        listConfig.valueField === "gross"
          ? listValueGross(r) ?? listValueNet(r, listConfig.type)
          : listValueNet(r, listConfig.type);
      if (v != null && Number.isFinite(v)) valueSum += v;
    }
    return [
      { label: "Dokumenty", value: total },
      { label: "Szkice", value: drafts, tone: "amber" as const },
      { label: "Zaksięgowane", value: posted, tone: "emerald" as const },
      { label: "Wartość", value: fmtMoney(valueSum), tone: "slate" as const },
    ];
  }, [rows, listConfig]);

  if (seriesLoading) {
    return (
      <DocumentsSectionShell title="Dokumenty magazynowe" subtitle="Ładowanie konfiguracji serii…">
        <div className="py-12 text-center text-sm text-slate-500">Ładowanie…</div>
      </DocumentsSectionShell>
    );
  }

  if (warehouseTypes.length === 0) {
    return (
      <DocumentsSectionShell
        title="Dokumenty magazynowe"
        subtitle="Brak skonfigurowanych serii magazynowych dla tego magazynu."
      >
        <DocumentsEmptyState
          icon={ClipboardList}
          title="Brak serii dokumentów magazynowych"
          description="Skonfiguruj serie PZ, WZ, MM, RW lub PW w Ustawieniach → Serie dokumentów. Bez aktywnej serii typ dokumentu nie jest dostępny operacyjnie."
        />
      </DocumentsSectionShell>
    );
  }

  if (routeType == null) {
    if (firstWarehousePath) return <Navigate to={firstWarehousePath} replace />;
    return <Navigate to="/documents/series" replace />;
  }

  if (!hasWarehouseType(routeType)) {
    return (
      <DocumentsSectionShell title={`Dokumenty magazynowe — ${docSegment?.toUpperCase() ?? ""}`}>
        <DocumentsEmptyState
          icon={ClipboardList}
          title="Brak aktywnej serii"
          description={`Brak aktywnej serii dokumentów ${docSegment?.toUpperCase() ?? ""} dla tego magazynu. Dodaj lub aktywuj serię w module Serii dokumentów.`}
        />
      </DocumentsSectionShell>
    );
  }

  if (zPzPageId != null) {
    return <WarehouseZPzDocumentPage documentId={zPzPageId} />;
  }

  if (routeType !== "Z_PZ") {
    const legacyTo = legacyWarehouseDocumentRedirect(docSegment, searchParams);
    if (legacyTo) return <Navigate to={legacyTo} replace />;
  }

  return (
    <>
      {toastText
        ? createPortal(
            <div
              className="fixed bottom-6 left-1/2 max-w-md -translate-x-1/2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-center text-sm text-white shadow-lg"
              style={{ zIndex: Z_WAREHOUSE_DOC_TOAST }}
              role="status"
            >
              {toastText}
            </div>,
            document.body,
          )
        : null}

      <DocumentsSectionShell
        title={`Dokumenty magazynowe — ${docTypeTitle}`}
        kpi={<DocumentsKpiRow items={warehouseKpi} />}
        toolbar={
          <DocumentsFiltersToolbar>
            <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <select
                aria-label="Wybór organizacji"
                value={tenantId ?? resolvedTenantId}
                onChange={(e) => setTenantId(Number(e.target.value))}
                className={`${documentsTableSelectCls} min-w-[14rem]`}
              >
                {tenants.length === 0 ? (
                  <option value={resolvedTenantId}>#{resolvedTenantId}</option>
                ) : (
                  tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </DocumentsFiltersToolbar>
        }
      >
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        {loading ? (
          <DocumentsTableCard>
            <div className="px-6 py-12 text-center text-sm text-slate-500">Ładowanie…</div>
          </DocumentsTableCard>
        ) : rows.length === 0 ? (
          <DocumentsTableCard>
            <DocumentsEmptyState
              icon={ClipboardList}
              title="Nie znaleziono dokumentów"
              description={`Brak zapisów typu ${docTypeTitle} dla wybranej organizacji. Utwórz dokument z modułu magazynowego (np. przyjęcie PZ), aby pojawił się na liście.`}
            />
          </DocumentsTableCard>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={selectedDocIds.size === 0}
                  onClick={() => setBulkPrintOpen(true)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Drukuj zaznaczone ({selectedDocIds.size})
                </button>
                {selectedDocIds.size > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSelectedDocIds(new Set())}
                    className="text-sm text-slate-500 hover:text-slate-800"
                  >
                    Odznacz
                  </button>
                ) : null}
              </div>
              <DataTablePageSizeSelect
                value={pageSize}
                onChange={(next) => {
                  setPageSize(next);
                  setPage(1);
                }}
              />
            </div>
            <DocumentsTableCard>
              <WarehouseDocumentsTable
                rows={pagedRows}
                docType={docTab}
                printMenuOpenId={printMenuOpenId}
                onOpenDetail={goToDetail}
                onDelete={setDeleteConfirmId}
                onPrintMenuToggle={setPrintMenuOpenId}
                onPrint={printDocumentPdf}
                onDownloadPdf={openDocumentPdf}
                onDuplicate={async (id) => {
                  try {
                    const d = await duplicateStockDocument(resolvedTenantId, id);
                    goToDetail(d.id);
                    void load();
                  } catch (err: unknown) {
                    const msg =
                      err && typeof err === "object" && "response" in err
                        ? (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
                        : null;
                    window.alert(msg != null ? String(msg) : "Nie udało się utworzyć kopii.");
                  }
                }}
                selectedIds={selectedDocIds}
                onToggleSelect={(id) =>
                  setSelectedDocIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onToggleSelectAll={() => {
                  setSelectedDocIds((prev) => {
                    const allOnPage = pagedRows.every((r) => prev.has(r.id));
                    if (allOnPage) return new Set();
                    return new Set(pagedRows.map((r) => r.id));
                  });
                }}
                allSelected={pagedRows.length > 0 && pagedRows.every((r) => selectedDocIds.has(r.id))}
              />
            </DocumentsTableCard>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>
                Strona {page} / {totalPages} ({rows.length} łącznie)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Poprzednia
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Następna
                </button>
              </div>
            </div>
          </div>
        )}
      </DocumentsSectionShell>

      {deleteConfirmId != null
        ? createPortal(
            <div
              className="fixed inset-0 flex items-center justify-center bg-slate-900/50 p-4"
              style={{ zIndex: Z_WAREHOUSE_DOC_CONFIRM }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-doc-title"
            >
              <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                <h3 id="delete-doc-title" className="text-lg font-bold text-slate-900">
                  Usunąć dokument?
                </h3>
                <p className="mt-2 text-sm text-slate-600">Dokument zostanie trwale usunięty.</p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={() => {
                      if (!deleteBusy) setDeleteConfirmId(null);
                    }}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Anuluj
                  </button>
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={() => void confirmDeleteDocument()}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {deleteBusy ? "Usuwanie…" : "Usuń"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {stockDocumentPickerModal}
      <ErpBulkPrintModal
        open={bulkPrintOpen}
        onClose={() => setBulkPrintOpen(false)}
        tenantId={resolvedTenantId}
        title="Masowy druk dokumentów magazynowych"
        ids={Array.from(selectedDocIds)}
        documentTypes={[stockBulkDocumentType(docTab)]}
      />
    </>
  );
}
