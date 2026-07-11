import { log } from "../../utils/logger";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { ClipboardList } from "lucide-react";
import { fetchTenantsList } from "../../api/tenantsApi";
import {
  acceptStockDocument,
  deleteStockDocument,
  duplicateStockDocument,
  getStockDocument,
  listStockDocuments,
  patchStockDocumentItems,
  patchStockDocumentMetadata,
  type StockDocumentListRow,
  type StockDocumentRead,
} from "../../api/stockDocumentsApi";
import { scanWmsCarrierByBarcode } from "../../api/wmsCarrierApi";
import { CarrierAssignProductsModal } from "../../components/warehouse/carriers/CarrierAssignProductsModal";
import { CarrierCreateModal } from "../../components/warehouse/carriers/CarrierCreateModal";
import { formatMoneyPl } from "../../utils/formatOrderMoney";
import { useDocumentTemplatePrint } from "../../hooks/useDocumentTemplatePrint";
import { stockKindFromType } from "../../utils/documentTemplatePrint";
import {
  ErpBulkPrintModal,
  stockBulkDocumentType,
} from "../../components/documentTemplates/ErpBulkPrintModal";
import { DataTablePageSizeSelect } from "../../components/table/DataTablePageSizeSelect";
import WarehouseDocumentsTable from "./WarehouseDocumentsTable";
import { WarehouseDocumentDetailFooter } from "./WarehouseDocumentDetailFooter";
import { WarehouseDocumentDetailInfo } from "./WarehouseDocumentDetailInfo";
import { WarehouseDocumentLinesSection } from "./WarehouseDocumentLinesSection";
import { WarehouseZPzDocumentPage } from "./WarehouseZPzDocumentPage";
import { getWarehouseDocumentConfig } from "./warehouseDocumentConfigs";
import {
  listValueGross,
  listValueNet,
} from "./warehouseDocumentHelpers";
import {
  logReceivingStatusDebug,
  normalizeWarehouseDocType,
  warehouseDocumentListStatus,
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
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set());
  const [bulkPrintOpen, setBulkPrintOpen] = useState(false);
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
      if (docTab === "Z_PZ" || routeType === "Z_PZ") {
        navigate(`/documents/warehouse/z-pz?id=${id}`);
        return;
      }
      log("[stock-document]", {
        sessionReady,
        tenantId,
        warehouseId,
        warehousesLoading,
        documentId: id,
      });
      if (!sessionReady || warehousesLoading || warehouseId == null || tenantId == null) {
        return;
      }
      setDetailId(id);
      setDetail(null);
      setDetailErr(null);
      setReceivedByLineId({});
      setDetailLoading(true);
      try {
        const d = await getStockDocument(tenantId, id, warehouseId);
        setDetail(d);
        setDetailOpen(true);
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
        setDetailOpen(false);
      } finally {
        setDetailLoading(false);
      }
    },
    [tenantId, warehouseId, sessionReady, warehousesLoading, docTab, routeType, navigate],
  );

  useEffect(() => {
    if (routeType === "Z_PZ") return;
    const raw = searchParams.get("id");
    const openId = raw ? Number(raw) : NaN;
    if (!Number.isFinite(openId) || openId <= 0) return;
    if (!sessionReady || warehousesLoading || warehouse?.id == null || tenantId == null) return;
    if (detailId === openId && detailOpen && !detailErr) return;
    if (detailId === openId && detailLoading) return;
    void openDetail(openId);
  }, [
    searchParams,
    openDetail,
    detailId,
    detailOpen,
    detailErr,
    detailLoading,
    routeType,
    sessionReady,
    warehousesLoading,
    warehouse?.id,
    tenantId,
  ]);

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
          const sc = await scanWmsCarrierByBarcode(resolvedTenantId, bc);
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
      const updated = await patchStockDocumentItems(resolvedTenantId, detailId, { items: itemsPayload });
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
            const sc = await scanWmsCarrierByBarcode(resolvedTenantId, bc);
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
        await patchStockDocumentItems(resolvedTenantId, detailId, { items: linePatch });
      }
      const updated = await acceptStockDocument(resolvedTenantId, detailId);
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
      const updated = await patchStockDocumentMetadata(resolvedTenantId, detailId, {
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
      await deleteStockDocument(resolvedTenantId, id);
      setDeleteConfirmId(null);
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (detailId === id) closeDetail();
      void load();
    } catch {
      setToastText("Błąd podczas usuwania dokumentu");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteConfirmId, resolvedTenantId, detailId, closeDetail, load]);

  const handleDuplicateDocument = async () => {
    if (!detail || detailId === null) return;
    setDetailBusy(true);
    try {
      const newDoc = await duplicateStockDocument(resolvedTenantId, detailId);
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
    const kindCode = stockKindFromType(detail?.document_type ?? docTab);
    void requestStockDocumentPrint({ kind: "stock_document", documentId: id, kindCode }, { autoPrint: false });
  };

  const printDocumentPdf = (id: number) => {
    const kindCode = stockKindFromType(detail?.document_type ?? docTab);
    void requestStockDocumentPrint({ kind: "stock_document", documentId: id, kindCode });
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
    const biz = warehouseDocumentListStatus({
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

  if (zPzPageId != null) {
    return <WarehouseZPzDocumentPage documentId={zPzPageId} />;
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
                onOpenDetail={(id) => void openDetail(id)}
                onDelete={setDeleteConfirmId}
                onPrintMenuToggle={setPrintMenuOpenId}
                onPrint={printDocumentPdf}
                onDownloadPdf={openDocumentPdf}
                onDuplicate={async (id) => {
                  try {
                    const d = await duplicateStockDocument(resolvedTenantId, id);
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

      {(detailOpen || detailLoading || (detailErr != null && detailId != null)) ? (
        <div
          className="fixed inset-0 z-[270] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
          onClick={() => !detailBusy && closeDetail()}
        >
          <div
            className="flex h-[min(92vh,calc(100dvh-2rem))] w-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <div className="flex shrink-0 items-center justify-center border-b border-slate-200 px-4 py-6 text-sm text-slate-500">
                Wczytywanie dokumentu…
              </div>
            ) : detail ? (
              <WarehouseDocumentDetailInfo
                detail={detail}
                detailDocType={detailDocType}
                detailBizStatus={detailBizStatus}
                detailListConfig={detailListConfig}
                isDraft={isDraft}
                isPzDetail={isPzDetail}
                editMode={editMode}
                canEditMetadata={canEditMetadata}
                metaCurrency={metaCurrency}
                metaNet={metaNet}
                metaGross={metaGross}
                onMetaCurrencyChange={setMetaCurrency}
                onMetaNetChange={setMetaNet}
                onMetaGrossChange={setMetaGross}
                fmtMoneyCur={fmtMoneyCur}
                listValueNetFormatted={fmtMoneyCur(
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
              />
            ) : (
              <header className="shrink-0 border-b border-slate-200 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Dokument magazynowy</p>
                <h2 className="text-xl font-semibold text-slate-900">
                  {detailId != null ? `#${detailId}` : "—"}
                </h2>
              </header>
            )}

            {detailErr ? (
              <div className="shrink-0 border-b border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800">{detailErr}</div>
            ) : null}

            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              {detailLoading ? (
                <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Wczytywanie…</div>
              ) : detail ? (
                <div ref={docLinesRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <WarehouseDocumentLinesSection
                    className="min-h-0 flex-1"
                    detail={detail}
                    tenantId={resolvedTenantId}
                    isWzDetail={isWzDetail}
                    showPurchaseSalesBlock={isPzDetail}
                    onSalesBlockUpdated={() => {
                      if (detailId != null) void openDetail(detailId);
                    }}
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
              ) : null}

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
        </div>
      ) : null}

      <CarrierAssignProductsModal
        tenantId={resolvedTenantId}
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
        tenantId={resolvedTenantId}
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
