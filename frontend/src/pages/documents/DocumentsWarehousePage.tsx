import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useWarehouse } from "../../context/WarehouseContext";
import { ClipboardList } from "lucide-react";
import api from "../../api/axios";
import {
  acceptStockDocument,
  deleteStockDocument,
  duplicateStockDocument,
  getStockDocument,
  listStockDocuments,
  patchStockDocumentItems,
  patchStockDocumentMetadata,
  stockDocumentPdfUrl,
  type StockDocumentListRow,
  type StockDocumentRead,
} from "../../api/stockDocumentsApi";
import { scanWmsCarrierByBarcode } from "../../api/wmsCarrierApi";
import { CarrierAssignProductsModal } from "../../components/warehouse/carriers/CarrierAssignProductsModal";
import { CarrierCreateModal } from "../../components/warehouse/carriers/CarrierCreateModal";
import { formatMoneyPl } from "../../utils/formatOrderMoney";
import { openPdfUrlInPrintViewer } from "../../utils/openPdfForBrowserPrint";
import { DataTablePageSizeSelect } from "../../components/table/DataTablePageSizeSelect";
import { DocumentTypeBadge, ExternalStatusBadge } from "./documentsBadges";
import WarehouseDocumentsTable from "./WarehouseDocumentsTable";
import { WarehouseDocumentDetailFooter } from "./WarehouseDocumentDetailFooter";
import { WarehouseDocumentLinesSection } from "./WarehouseDocumentLinesSection";
import { getWarehouseDocumentConfig } from "./warehouseDocumentConfigs";
import {
  documentSourceLabelDetail,
  listValueGross,
  listValueNet,
  seriesCode,
  shouldShowCustomerCard,
  shouldShowDocumentSourceCard,
  shouldShowSupplierCard,
} from "./warehouseDocumentHelpers";
import { documentCreatedByLabel } from "../../utils/documentCreatedBy";
import {
  businessDocStatus,
  logReceivingStatusDebug,
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

type Tenant = { id: number; name: string };
const WAREHOUSE_DOCS_PAGE_SIZE_KEY = "warehouse_docs.pageSize";

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function fmtMoney(n: number) {
  return formatMoneyPl(n);
}

function fmtMoneyCur(n: number | null | undefined, currency: string | undefined) {
  const c = (currency || "PLN").trim() || "PLN";
  if (n == null || !Number.isFinite(n)) return "—";
  if (c === "PLN" || c === "zł") return formatMoneyPl(n);
  return formatMoneyPl(n, { currency: c });
}

function parseQty(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

export default function DocumentsWarehousePage() {
  const { docSegment } = useParams<{ docSegment: string }>();
  const [searchParams] = useSearchParams();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { warehouseTypes, firstWarehousePath, loading: seriesLoading, hasWarehouseType } = useOperationalDocumentSeries();

  const routeType = useMemo((): WarehouseDocumentType | null => {
    const seg = String(docSegment ?? "").trim().toLowerCase();
    if (!seg) return null;
    const hit = warehouseTypes.find((t) => (t.route_segment || "").toLowerCase() === seg);
    if (!hit?.stock_document_type) return null;
    return normalizeWarehouseDocType(hit.stock_document_type);
  }, [docSegment, warehouseTypes]);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
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

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StockDocumentRead | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [receivedByLineId, setReceivedByLineId] = useState<Record<number, string>>({});
  const [suggestedCarrierBarcodeByLineId, setSuggestedCarrierBarcodeByLineId] = useState<Record<number, string>>({});
  const [assignPickerLineId, setAssignPickerLineId] = useState<number | null>(null);
  const [createCarrierLineId, setCreateCarrierLineId] = useState<number | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [metaCurrency, setMetaCurrency] = useState("PLN");
  const [metaNet, setMetaNet] = useState("");
  const [metaGross, setMetaGross] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);
  const [printMenuOpenId, setPrintMenuOpenId] = useState<number | null>(null);
  const [detailPrintMenuOpen, setDetailPrintMenuOpen] = useState(false);
  const docLinesRef = useRef<HTMLDivElement | null>(null);

  const inputClass =
    "w-full min-w-[4.5rem] rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums text-slate-800 focus:border-violet-400 focus:ring-2 focus:ring-violet-500";

  useEffect(() => {
    if (routeType) setDocTab(routeType);
  }, [routeType]);

  useEffect(() => {
    localStorage.setItem(WAREHOUSE_DOCS_PAGE_SIZE_KEY, String(pageSize));
  }, [pageSize]);

  useEffect(() => {
    api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        if (list.length > 0 && !list.some((t) => t.id === tenantId)) setTenantId(list[0].id);
      })
      .catch(() => setTenants([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load tenants once on mount
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRows(
        await listStockDocuments(tenantId, {
          document_type: docTab,
          warehouse_id: warehouseId ?? undefined,
        }),
      );
    } catch {
      setErr("Nie udało się wczytać dokumentów.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, docTab, warehouseId]);

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
    if (printMenuOpenId == null && !detailPrintMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (el.closest("[data-print-menu-root]")) return;
      setPrintMenuOpenId(null);
      setDetailPrintMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [printMenuOpenId, detailPrintMenuOpen]);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailId(null);
    setDetail(null);
    setDetailErr(null);
    setReceivedByLineId({});
    setMetaCurrency("PLN");
    setMetaNet("");
    setMetaGross("");
  }, []);

  useEffect(() => {
    if (!detail) return;
    setMetaCurrency((detail.currency || "PLN").trim() || "PLN");
    setMetaNet(detail.total_net != null ? String(detail.total_net) : "");
    setMetaGross(detail.total_gross != null ? String(detail.total_gross) : "");
  }, [detail]);

  const openDetail = useCallback(
    async (id: number) => {
      setDetailOpen(true);
      setDetailId(id);
      setDetail(null);
      setDetailErr(null);
      setReceivedByLineId({});
      setDetailLoading(true);
      try {
        const d = await getStockDocument(tenantId, id);
        setDetail(d);
        const init: Record<number, string> = {};
        const carrierInit: Record<number, string> = {};
        for (const it of d.items) {
          init[it.id] = String(it.received_quantity);
          carrierInit[it.id] = (it.suggested_warehouse_carrier_barcode || "").trim();
        }
        setReceivedByLineId(init);
        setSuggestedCarrierBarcodeByLineId(carrierInit);
      } catch {
        setDetailErr("Nie udało się wczytać dokumentu.");
      } finally {
        setDetailLoading(false);
      }
    },
    [tenantId],
  );

  useEffect(() => {
    const raw = searchParams.get("id");
    const openId = raw ? Number(raw) : NaN;
    if (!Number.isFinite(openId) || openId <= 0) return;
    if (detailId === openId && detailOpen) return;
    void openDetail(openId);
  }, [searchParams, openDetail, detailId, detailOpen]);

  const receiveAll = useCallback(() => {
    if (!detail) return;
    const next: Record<number, string> = {};
    for (const it of detail.items) {
      next[it.id] = String(it.ordered_quantity);
    }
    setReceivedByLineId(next);
  }, [detail]);

  const buildPatchItems = useCallback(() => {
    if (!detail) return { ok: false as const, msg: "Brak danych" };
    const items: { id: number; received_quantity: number }[] = [];
    for (const it of detail.items) {
      const raw = receivedByLineId[it.id];
      if (raw === undefined) return { ok: false as const, msg: "Uzupełnij ilości przyjęte dla wszystkich pozycji." };
      const q = parseQty(raw);
      if (q === null) return { ok: false as const, msg: `Niepoprawna liczba dla pozycji #${it.id}.` };
      if (q < 0) return { ok: false as const, msg: "Ilość przyjęta nie może być ujemna." };
      items.push({ id: it.id, received_quantity: q });
    }
    return { ok: true as const, items };
  }, [detail, receivedByLineId]);

  const handleSaveDraft = async () => {
    if (!detail || detailId === null) return;
    const built = buildPatchItems();
    if (!built.ok) {
      window.alert(built.msg);
      return;
    }
    const applyCarrierColumn =
      detail.status === "draft" &&
      normalizeWarehouseDocType(detail.document_type) === "PZ" &&
      (detail.edit_mode ?? "none") === "full";
    let itemsPayload: { id: number; received_quantity: number; suggested_warehouse_carrier_id?: number | null }[] =
      built.items;
    if (applyCarrierColumn) {
      itemsPayload = [];
      for (const row of built.items) {
        const bc = (suggestedCarrierBarcodeByLineId[row.id] ?? "").trim();
        if (!bc) {
          itemsPayload.push({ ...row, suggested_warehouse_carrier_id: null });
          continue;
        }
        try {
          const sc = await scanWmsCarrierByBarcode(tenantId, bc);
          if (!sc.found || !sc.carrier) {
            window.alert(`Nie znaleziono nośnika o kodzie: ${bc}`);
            return;
          }
          itemsPayload.push({ ...row, suggested_warehouse_carrier_id: sc.carrier.id });
        } catch {
          window.alert(`Błąd weryfikacji nośnika: ${bc}`);
          return;
        }
      }
    }
    setDetailBusy(true);
    try {
      const updated = await patchStockDocumentItems(tenantId, detailId, { items: itemsPayload });
      setDetail(updated);
      const init: Record<number, string> = {};
      const cInit: Record<number, string> = {};
      for (const it of updated.items) {
        init[it.id] = String(it.received_quantity);
        cInit[it.id] = (it.suggested_warehouse_carrier_barcode || "").trim();
      }
      setReceivedByLineId(init);
      setSuggestedCarrierBarcodeByLineId(cInit);
      void load();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null;
      window.alert(msg != null ? String(msg) : "Nie udało się zapisać zmian.");
    } finally {
      setDetailBusy(false);
    }
  };

  const handleAccept = async () => {
    if (!detail || detailId === null) return;
    if (detail.warehouse_id == null || detail.warehouse_id <= 0) {
      window.alert(
        "Ustaw magazyn przyjęcia (np. w WMS → Przyjęcie lub domyślny magazyn organizacji), potem zatwierdź PZ tutaj.",
      );
      return;
    }
    const skipLinePatch = detail.edit_mode === "metadata";
    let linePatch: { id: number; received_quantity: number; suggested_warehouse_carrier_id?: number | null }[] | null =
      null;
    if (!skipLinePatch) {
      const built = buildPatchItems();
      if (!built.ok) {
        window.alert(built.msg);
        return;
      }
      const applyCarrierColumn =
        detail.status === "draft" &&
        normalizeWarehouseDocType(detail.document_type) === "PZ" &&
        (detail.edit_mode ?? "none") === "full";
      if (applyCarrierColumn) {
        const enriched: { id: number; received_quantity: number; suggested_warehouse_carrier_id: number | null }[] = [];
        for (const row of built.items) {
          const bc = (suggestedCarrierBarcodeByLineId[row.id] ?? "").trim();
          if (!bc) {
            enriched.push({ ...row, suggested_warehouse_carrier_id: null });
            continue;
          }
          try {
            const sc = await scanWmsCarrierByBarcode(tenantId, bc);
            if (!sc.found || !sc.carrier) {
              window.alert(`Nie znaleziono nośnika o kodzie: ${bc}`);
              return;
            }
            enriched.push({ ...row, suggested_warehouse_carrier_id: sc.carrier.id });
          } catch {
            window.alert(`Błąd weryfikacji nośnika: ${bc}`);
            return;
          }
        }
        linePatch = enriched;
      } else {
        linePatch = built.items;
      }
    }
    setDetailBusy(true);
    try {
      if (linePatch) {
        await patchStockDocumentItems(tenantId, detailId, { items: linePatch });
      }
      const updated = await acceptStockDocument(tenantId, detailId);
      setDetail(updated);
      const init: Record<number, string> = {};
      const cInit: Record<number, string> = {};
      for (const it of updated.items) {
        init[it.id] = String(it.received_quantity);
        cInit[it.id] = (it.suggested_warehouse_carrier_barcode || "").trim();
      }
      setReceivedByLineId(init);
      setSuggestedCarrierBarcodeByLineId(cInit);
      void load();
      if (updated.status === "posted") {
        closeDetail();
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null;
      window.alert(msg != null ? String(msg) : "Nie udało się zatwierdzić przyjęcia.");
    } finally {
      setDetailBusy(false);
    }
  };

  const handleSaveMetadata = async () => {
    if (!detail || detailId === null) return;
    const parseOpt = (s: string): number | null => {
      const t = s.trim().replace(",", ".");
      if (t === "") return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };
    setDetailBusy(true);
    try {
      const updated = await patchStockDocumentMetadata(tenantId, detailId, {
        currency: metaCurrency.trim() || undefined,
        total_net: parseOpt(metaNet),
        total_gross: parseOpt(metaGross),
      });
      setDetail(updated);
      setToastText("Zapisano wartości dokumentu (waluta, sumy netto / brutto).");
      void load();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null;
      window.alert(msg != null ? String(msg) : "Nie udało się zapisać metadanych.");
    } finally {
      setDetailBusy(false);
    }
  };

  const confirmDeleteDocument = useCallback(async () => {
    if (deleteConfirmId == null) return;
    const id = deleteConfirmId;
    setDeleteBusy(true);
    try {
      await deleteStockDocument(tenantId, id);
      setDeleteConfirmId(null);
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (detailId === id) closeDetail();
      void load();
    } catch {
      setToastText("Błąd podczas usuwania dokumentu");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteConfirmId, tenantId, detailId, closeDetail, load]);

  const handleDuplicateDocument = async () => {
    if (!detail || detailId === null) return;
    setDetailBusy(true);
    try {
      const newDoc = await duplicateStockDocument(tenantId, detailId);
      closeDetail();
      void openDetail(newDoc.id);
      void load();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null;
      window.alert(msg != null ? String(msg) : "Nie udało się zduplikować dokumentu.");
    } finally {
      setDetailBusy(false);
    }
  };

  const openDocumentPdf = (id: number) => {
    openPdfUrlInPrintViewer(stockDocumentPdfUrl(tenantId, id));
  };

  const printDocumentPdf = (id: number) => {
    openPdfUrlInPrintViewer(stockDocumentPdfUrl(tenantId, id), {
      autoPrint: true,
      autoPrintDelayMs: 1000,
    });
  };

  const docStatusLower = (detail?.status || "").toLowerCase();
  const isDraft = docStatusLower === "draft";
  const isWmsCompleteDraft = docStatusLower === "zakonczone";
  const isPzDetail = detail ? normalizeWarehouseDocType(detail.document_type) === "PZ" : false;
  const isWzDetail = detail ? normalizeWarehouseDocType(detail.document_type) === "WZ" : false;
  const detailDocType = detail ? normalizeWarehouseDocType(detail.document_type) : docTab;
  const detailListConfig = getWarehouseDocumentConfig(detailDocType);
  const editMode = detail?.edit_mode ?? "none";
  const lineEditEnabled = Boolean(isDraft && isPzDetail && editMode === "full");
  const canPostAccept =
    detail != null && detail.warehouse_id != null && detail.warehouse_id > 0 && (isDraft || isWmsCompleteDraft);
  const canEditMetadata = isDraft && (editMode === "full" || editMode === "metadata");

  const detailBizStatus = useMemo(() => {
    if (!detail) return null;
    let tr = 0;
    let pendingPutaway = 0;
    for (const it of detail.items) {
      const rec = Number(it.received_quantity) || 0;
      const put = Number(it.quantity_putaway) || 0;
      tr += rec;
      if (rec > put + 1e-6) pendingPutaway += rec - put;
    }
    const biz = businessDocStatus({
      status: detail.status,
      document_type: detail.document_type,
      total_received: tr,
      receiving_status: detail.receiving_status,
      putaway_status: detail.putaway_status,
      relocation_status: detail.relocation_status,
      is_fully_received: detail.is_fully_received,
      is_fully_putaway: detail.is_fully_putaway,
    });
    logReceivingStatusDebug(`PZ #${detail.id}`, {
      receivedQty: tr,
      pendingPutaway,
      linkedDeliveryId: detail.delivery_id ?? null,
      canFinalize: canPostAccept && (biz === "GOTOWE" || biz === "ZAKOŃCZONE"),
      receivingStatus: detail.receiving_status,
      putawayStatus: detail.putaway_status,
      relocationStatus: detail.relocation_status,
      documentStatus: detail.status,
      isFullyReceived: detail.is_fully_received,
      isFullyPutaway: detail.is_fully_putaway,
    });
    return biz;
  }, [detail, canPostAccept]);

  const lineSummary = useMemo(() => {
    if (!detail?.items.length) return null;
    let sumOrdered = 0;
    let sumReceived = 0;
    let sumValueNet = 0;
    let sumValueGross = 0;
    for (const it of detail.items) {
      sumOrdered += it.ordered_quantity;
      const raw = receivedByLineId[it.id] ?? String(it.received_quantity);
      const rec = parseQty(raw) ?? it.received_quantity;
      sumReceived += rec;
      const qtyForVal = isWzDetail
        ? Number(it.quantity) || Number(it.ordered_quantity) || 0
        : rec;
      if (it.purchase_price_net != null && Number.isFinite(qtyForVal)) {
        sumValueNet += qtyForVal * it.purchase_price_net;
      } else if (it.value_net != null && Number.isFinite(it.value_net)) {
        sumValueNet += it.value_net;
      }
      if (it.value_gross != null && Number.isFinite(it.value_gross)) {
        sumValueGross += it.value_gross;
      } else if (it.unit_price_gross != null && Number.isFinite(qtyForVal)) {
        sumValueGross += qtyForVal * it.unit_price_gross;
      }
    }
    const sumVat = Math.max(0, sumValueGross - sumValueNet);
    return {
      lineCount: detail.items.length,
      sumOrdered,
      sumReceived,
      sumDiff: sumReceived - sumOrdered,
      sumValueNet,
      sumValueGross,
      sumVat,
    };
  }, [detail, receivedByLineId, isWzDetail]);

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

  return (
    <>
      {toastText ? (
        <div
          className="fixed bottom-6 left-1/2 z-[400] max-w-md -translate-x-1/2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-center text-sm text-white shadow-lg"
          role="status"
        >
          {toastText}
        </div>
      ) : null}

      <DocumentsSectionShell
        title={`Dokumenty magazynowe — ${docTypeTitle}`}
        kpi={<DocumentsKpiRow items={warehouseKpi} />}
        toolbar={
          <DocumentsFiltersToolbar>
            <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <select
                aria-label="Wybór organizacji"
                value={tenantId}
                onChange={(e) => setTenantId(Number(e.target.value))}
                className={`${documentsTableSelectCls} min-w-[14rem]`}
              >
                {tenants.length === 0 ? (
                  <option value={tenantId}>#{tenantId}</option>
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
            <div className="flex justify-end">
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
                onOpenDetail={(id) => void openDetail(id)}
                onDelete={setDeleteConfirmId}
                onPrintMenuToggle={setPrintMenuOpenId}
                onPrint={printDocumentPdf}
                onDownloadPdf={openDocumentPdf}
                onDuplicate={async (id) => {
                  try {
                    const d = await duplicateStockDocument(tenantId, id);
                    void openDetail(d.id);
                    void load();
                  } catch (err: unknown) {
                    const msg =
                      err && typeof err === "object" && "response" in err
                        ? (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
                        : null;
                    window.alert(msg != null ? String(msg) : "Nie udało się utworzyć kopii.");
                  }
                }}
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

      {detailOpen ? (
        <div
          className="fixed inset-0 z-[270] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
          onClick={() => !detailBusy && closeDetail()}
        >
          <div
            className="flex max-h-[min(92vh,calc(100dvh-2rem))] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="shrink-0 border-b border-slate-200 bg-white px-6 pb-5 pt-6">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {detail ? `Dokument magazynowy · ${normalizeWarehouseDocType(detail.document_type)}` : "Dokument magazynowy"}
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 space-y-2">
                  {detail ? (
                    <DocumentTypeBadge code={detail.document_type} />
                  ) : null}
                  <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                    {detailId != null && detail
                      ? `${normalizeWarehouseDocType(detail.document_type)} ${(detail.document_number || "").trim() || detailId}`
                      : detailId != null
                        ? `#${detailId}`
                        : "—"}
                  </h2>
                  {detail ? (
                    isDraft && isPzDetail && editMode === "full" ? (
                      <p className="max-w-xl text-sm leading-relaxed text-slate-600">
                        Stan <span className="font-semibold">NOWE</span>: możesz edytować przyjęte ilości i pola finansowe.
                        Różnica liczy się automatycznie. Po zatwierdzeniu aktualizują się stany magazynowe i pozycje na
                        zamówieniu.
                      </p>
                    ) : isDraft && isPzDetail && editMode === "metadata" ? (
                      <p className="max-w-xl text-sm leading-relaxed text-amber-900">
                        Stan <span className="font-semibold">W TRAKCIE</span>: edycja ilości na pozycjach jest zablokowana.
                        Możesz zmieniać wyłącznie pola finansowe (waluta, sumy netto/brutto) — bez wpływu na operacje
                        magazynowe.
                      </p>
                    ) : isDraft && !isPzDetail ? (
                      <p className="max-w-xl text-sm leading-relaxed text-slate-600">
                        Podgląd szkicu — pełna obsługa operacyjna dla typów innych niż PZ zostanie dodana w kolejnych
                        wersjach.
                      </p>
                    ) : (
                      <p className="text-sm text-slate-600">Dokument zaksięgowany lub anulowany — podgląd tylko do odczytu.</p>
                    )
                  ) : (
                    <p className="text-sm text-slate-500">Wczytywanie dokumentu…</p>
                  )}
                </div>
                {detail && detailBizStatus ? <ExternalStatusBadge status={detailBizStatus} /> : null}
              </div>
            </header>

            {detailErr ? (
              <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-800">{detailErr}</div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {detailLoading ? (
                <div className="flex items-center justify-center py-16 text-sm text-slate-500">Wczytywanie…</div>
              ) : detail ? (
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    {detail && shouldShowSupplierCard(detailDocType, detail) ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">Dostawca</h3>
                        <p className="text-lg font-semibold text-slate-900">{(detail.supplier_name || "").trim()}</p>
                        <p className="mt-2 text-sm text-slate-500">Identyfikator w systemie · #{detail.supplier_id}</p>
                      </div>
                    ) : null}
                    {detail && shouldShowCustomerCard(detailDocType) ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">Klient</h3>
                        <p className="text-lg font-semibold text-slate-900">{(detail.customer_name || "").trim() || "—"}</p>
                      </div>
                    ) : null}
                    {detail && shouldShowDocumentSourceCard(detailDocType) ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">Źródło dokumentu</h3>
                        <p className="text-lg font-semibold text-slate-900">{documentSourceLabelDetail(detail)}</p>
                      </div>
                    ) : null}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">Dokument</h3>
                      <dl className="space-y-3 text-sm">
                        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
                          <dt className="text-slate-500">Typ</dt>
                          <dd>
                            <DocumentTypeBadge code={detail.document_type} />
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
                          <dt className="text-slate-500">Seria</dt>
                          <dd className="font-semibold text-slate-900">{seriesCode(detail)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
                          <dt className="text-slate-500">Utworzył</dt>
                          <dd className="text-right font-medium text-slate-900">
                            {documentCreatedByLabel(detail.created_by)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
                          <dt className="text-slate-500">Data utworzenia</dt>
                          <dd className="text-right font-medium tabular-nums text-slate-900">
                            {formatDt(detail.created_at)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
                          <dt className="text-slate-500">Magazyn</dt>
                          <dd className="text-right font-medium text-slate-900">
                            {detail.warehouse_id == null ? (
                              <span className="text-amber-800">— (WMS → Przyjęcie)</span>
                            ) : (
                              (detail.warehouse_name || "").trim() || `#${detail.warehouse_id}`
                            )}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
                          <dt className="text-slate-500">Lokalizacja</dt>
                          <dd className="text-right font-medium text-slate-900">
                            {detail.location_id == null ? (
                              <span className="text-amber-800">— (WMS → Przyjęcie)</span>
                            ) : (
                              (detail.location_name || "").trim() || `#${detail.location_id}`
                            )}
                          </dd>
                        </div>
                        {detail.order_id != null ? (
                          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
                            <dt className="text-slate-500">Zamówienie</dt>
                            <dd>
                              <Link
                                to={`/orders/${detail.order_id}`}
                                className="font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:text-violet-900"
                              >
                                #{(detail.order_number || "").trim() || detail.order_id}
                              </Link>
                            </dd>
                          </div>
                        ) : null}
                        {detail.production_order_id != null ? (
                          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
                            <dt className="text-slate-500">Zlecenie produkcyjne</dt>
                            <dd>
                              <Link
                                to={detail.production_order_path ?? "/production"}
                                className="font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:text-violet-900"
                              >
                                {(detail.production_order_number || "").trim() || `MO #${detail.production_order_id}`}
                              </Link>
                            </dd>
                          </div>
                        ) : null}
                        {detail.production_batch_id != null ? (
                          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
                            <dt className="text-slate-500">Partia produkcyjna</dt>
                            <dd>
                              <Link
                                to={detail.production_batch_path ?? `/production/batch/${detail.production_batch_id}`}
                                className="font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:text-violet-900"
                              >
                                {(detail.production_batch_number || "").trim() || `BAT #${detail.production_batch_id}`}
                              </Link>
                            </dd>
                          </div>
                        ) : null}
                        {detail.linked_sale_document ? (
                          <div className="flex items-center justify-between gap-4 pt-1">
                            <dt className="text-slate-500">Dokument sprzedaży</dt>
                            <dd>
                              <Link
                                to={detail.linked_sale_document.detail_path}
                                className="font-semibold text-emerald-700 underline decoration-emerald-200 underline-offset-2 hover:text-emerald-900"
                              >
                                {detail.linked_sale_document.document_number || detail.linked_sale_document.id}
                              </Link>
                            </dd>
                          </div>
                        ) : detail.delivery_id != null ? (
                          <div className="flex items-center justify-between gap-4 pt-1">
                            <dt className="text-slate-500">Dostawa</dt>
                            <dd>
                              <Link
                                to={`/goods-orders?edit=${detail.delivery_id}`}
                                className="font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:text-violet-900"
                              >
                                #{detail.delivery_id}
                              </Link>
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                  </div>

                  {detailListConfig.financialDetail !== "none" ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {detailListConfig.financialDetail === "netOnly" ? "Wartość dokumentu" : "Finanse dokumentu"}
                    </h3>
                    {canEditMetadata ? (
                      <div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <label className="flex flex-col gap-1 text-sm">
                            <span className="text-xs text-slate-500">Waluta (ISO)</span>
                            <input
                              value={metaCurrency}
                              onChange={(e) => setMetaCurrency(e.target.value.toUpperCase())}
                              maxLength={8}
                              className="rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm uppercase"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-sm">
                            <span className="text-xs text-slate-500">Suma netto</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={metaNet}
                              onChange={(e) => setMetaNet(e.target.value)}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-right tabular-nums"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-sm">
                            <span className="text-xs text-slate-500">Suma brutto</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={metaGross}
                              onChange={(e) => setMetaGross(e.target.value)}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-right tabular-nums"
                            />
                          </label>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          VAT z pozycji (wyliczone): {fmtMoneyCur(detail.total_vat, detail.currency)}
                        </p>
                      </div>
                    ) : detailListConfig.financialDetail === "netOnly" ? (
                      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                        <div>
                          <dt className="text-xs text-slate-500">Wartość netto</dt>
                          <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                            {fmtMoneyCur(
                              listValueNet(
                                {
                                  total_net: detail.total_net,
                                  total_gross: detail.total_gross,
                                  currency: detail.currency,
                                } as StockDocumentListRow,
                                detailDocType,
                              ),
                              detail.currency,
                            )}
                          </dd>
                        </div>
                      </dl>
                    ) : (
                      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                        <div>
                          <dt className="text-xs text-slate-500">Waluta</dt>
                          <dd className="mt-1 font-semibold text-slate-900">{(detail.currency || "PLN").trim() || "PLN"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">Suma netto</dt>
                          <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                            {fmtMoneyCur(detail.total_net, detail.currency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">VAT</dt>
                          <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                            {fmtMoneyCur(detail.total_vat, detail.currency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">Suma brutto</dt>
                          <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                            {fmtMoneyCur(detail.total_gross, detail.currency)}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>
                  ) : null}

                  <div ref={docLinesRef}>
                    <WarehouseDocumentLinesSection
                      detail={detail}
                      isWzDetail={isWzDetail}
                      lineEditEnabled={lineEditEnabled}
                      inputClass={inputClass}
                      receivedByLineId={receivedByLineId}
                      suggestedCarrierBarcodeByLineId={suggestedCarrierBarcodeByLineId}
                      onReceivedChange={(lineId, value) =>
                        setReceivedByLineId((prev) => ({ ...prev, [lineId]: value }))
                      }
                      onSuggestedCarrierChange={(lineId, value) =>
                        setSuggestedCarrierBarcodeByLineId((prev) => ({ ...prev, [lineId]: value }))
                      }
                      onAssignCarrier={setAssignPickerLineId}
                      onCreateCarrier={setCreateCarrierLineId}
                      onClearCarrier={(lineId) =>
                        setSuggestedCarrierBarcodeByLineId((prev) => ({ ...prev, [lineId]: "" }))
                      }
                      lineSummary={lineSummary}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <WarehouseDocumentDetailFooter
              detailBusy={detailBusy}
              detailId={detailId}
              detail={detail}
              detailPrintMenuOpen={detailPrintMenuOpen}
              onTogglePrintMenu={() => setDetailPrintMenuOpen((v) => !v)}
              onClose={closeDetail}
              onScrollToLines={() => docLinesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              onDelete={() => detailId != null && setDeleteConfirmId(detailId)}
              onDuplicate={() => void handleDuplicateDocument()}
              onPrint={() => {
                if (detailId != null) printDocumentPdf(detailId);
                setDetailPrintMenuOpen(false);
              }}
              onDownloadPdf={() => {
                if (detailId != null) openDocumentPdf(detailId);
                setDetailPrintMenuOpen(false);
              }}
              canEditMetadata={canEditMetadata}
              onSaveMetadata={() => void handleSaveMetadata()}
              isDraft={isDraft}
              isWmsCompleteDraft={isWmsCompleteDraft}
              isPzDetail={isPzDetail}
              lineEditEnabled={lineEditEnabled}
              canPostAccept={canPostAccept}
              onReceiveAll={receiveAll}
              onSaveDraft={() => void handleSaveDraft()}
              onAccept={() => void handleAccept()}
            />
          </div>
        </div>
      ) : null}

      <CarrierAssignProductsModal
        tenantId={tenantId}
        open={assignPickerLineId != null}
        onClose={() => setAssignPickerLineId(null)}
        onPick={(carrier) => {
          if (assignPickerLineId == null) return;
          setSuggestedCarrierBarcodeByLineId((prev) => ({
            ...prev,
            [assignPickerLineId]: (carrier.barcode || carrier.code || "").trim(),
          }));
          setAssignPickerLineId(null);
        }}
      />
      <CarrierCreateModal
        tenantId={tenantId}
        open={createCarrierLineId != null}
        onClose={() => setCreateCarrierLineId(null)}
        onCreated={(carrier) => {
          if (createCarrierLineId == null) return;
          setSuggestedCarrierBarcodeByLineId((prev) => ({
            ...prev,
            [createCarrierLineId]: (carrier.barcode || carrier.code || "").trim(),
          }));
          setCreateCarrierLineId(null);
        }}
      />

      {deleteConfirmId != null ? (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/50 p-4"
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
        </div>
      ) : null}
    </>
  );
}
