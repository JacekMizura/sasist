import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
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
  type StockDocumentItemRead,
  type StockDocumentListRow,
  type StockDocumentRead,
} from "../../api/stockDocumentsApi";
import { scanWmsCarrierByBarcode } from "../../api/wmsCarrierApi";
import { CarrierAssignProductsModal } from "../../components/warehouse/carriers/CarrierAssignProductsModal";
import { CarrierBadge } from "../../components/warehouse/carriers/CarrierBadge";
import { CarrierCreateModal } from "../../components/warehouse/carriers/CarrierCreateModal";
import { openPdfUrlInPrintViewer } from "../../utils/openPdfForBrowserPrint";
import { DataTablePageSizeSelect } from "../../components/table/DataTablePageSizeSelect";
import { DocumentTypeBadge, ExternalStatusBadge, PaymentNotApplicableBadge } from "./documentsBadges";
import { documentCreatedByLabel } from "../../utils/documentCreatedBy";
import { wmsReceiptLineImageUrl } from "../../utils/wmsReceiptLineMedia";
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
  documentsTableTheadCls,
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

/** Short date for list rows (business panel). */
function formatDateShort(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

function fmtQty(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 6 }).format(n);
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(n);
}

function fmtMoneyCur(n: number | null | undefined, currency: string | undefined) {
  const c = (currency || "PLN").trim() || "PLN";
  if (n == null || !Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("pl-PL", { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${c}`;
  }
}

function diffToneClass(diff: number) {
  if (Math.abs(diff) < 1e-9) return "text-slate-500";
  if (diff < 0) return "text-red-600 font-semibold";
  return "text-green-600 font-semibold";
}

function receiptTypeLabel(t: string | null | undefined): string {
  if (t === "carton") return "Karton";
  if (t === "packaging_material") return "Materiał pakowy";
  if (t === "product") return "Produkt";
  return "—";
}

function receiptLineDisplayName(it: StockDocumentItemRead): string {
  const n = (it.product_name || "").trim();
  if (n) return n;
  if (it.product_id != null) return `Produkt #${it.product_id}`;
  return "Pozycja";
}

function receiptLineLocation(it: StockDocumentItemRead): string {
  const a = it.putaway_allocations ?? [];
  const last = (it.putaway_last_location_name || "").trim();
  if (last) return last;
  const first = (a[0]?.location_code || a[0]?.location_name || "").trim();
  if (first) return first;
  return "—";
}

function receiptLineStatus(it: StockDocumentItemRead): string {
  const o = Number(it.ordered_quantity) || 0;
  const r = Number(it.received_quantity) || 0;
  if (o <= 1e-9) return "—";
  if (r + 1e-6 >= o) return "Dostarczono";
  if (r > 1e-6) return "W realizacji";
  return "Oczekuje";
}

function ProductThumb({ url }: { url?: string | null }) {
  const [bad, setBad] = useState(false);
  const src = url && !bad ? url : null;
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      {src ? (
        <img src={src} alt="" className="h-full w-full object-contain object-center" onError={() => setBad(true)} />
      ) : (
        <span className="text-[10px] font-medium text-slate-400">—</span>
      )}
    </div>
  );
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
          document_type: docTab === "ALL" ? undefined : (docTab as WarehouseDocumentType),
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
    let sumValue = 0;
    for (const it of detail.items) {
      sumOrdered += it.ordered_quantity;
      const raw = receivedByLineId[it.id] ?? String(it.received_quantity);
      const rec = parseQty(raw) ?? it.received_quantity;
      sumReceived += rec;
      if (it.purchase_price_net != null && Number.isFinite(rec)) {
        sumValue += rec * it.purchase_price_net;
      }
    }
    return {
      lineCount: detail.items.length,
      sumOrdered,
      sumReceived,
      sumDiff: sumReceived - sumOrdered,
      sumValue,
    };
  }, [detail, receivedByLineId]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const warehouseKpi = useMemo(() => {
    const total = rows.length;
    const drafts = rows.filter((r) => r.status === "draft").length;
    const posted = rows.filter((r) => r.status === "posted").length;
    let gross = 0;
    for (const r of rows) {
      if (r.total_gross != null && Number.isFinite(Number(r.total_gross))) gross += Number(r.total_gross);
    }
    return [
      { label: "Dokumenty na liście", value: total },
      { label: "Szkice", value: drafts, tone: "amber" as const },
      { label: "Zaksięgowane", value: posted, tone: "emerald" as const },
      { label: "Suma brutto", value: fmtMoney(gross), tone: "slate" as const },
    ];
  }, [rows]);

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
        title={`Dokumenty magazynowe — ${docTab}`}
        subtitle="Przyjęcia, wydania i przesunięcia międzymagazynowe powiązane z operacjami WMS. Typ dokumentu wybierasz w menu po lewej."
        kpi={<DocumentsKpiRow items={warehouseKpi} />}
        toolbar={
          <DocumentsFiltersToolbar>
            <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                Organizacja i filtry listy — spójnie z operacjami magazynowymi.
              </p>
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
              description={`Brak zapisów typu ${docTab} dla wybranej organizacji. Utwórz dokument z modułu magazynowego (np. przyjęcie PZ), aby pojawił się na liście.`}
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] text-left text-base">
            <thead className={`text-left ${documentsTableTheadCls}`}>
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500 sm:px-5 sm:text-sm">
                  Nr dokumentu
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500 sm:px-5 sm:text-sm">
                  Nr zamówienia
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500 sm:px-5 sm:text-sm">
                  Klient
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500 sm:px-5 sm:text-sm">
                  Seria
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500 sm:px-5 sm:text-sm">
                  Typ
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500 sm:px-5 sm:text-sm">
                  Data
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wide text-slate-500 sm:px-5 sm:text-sm">
                  Netto
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wide text-slate-500 sm:px-5 sm:text-sm">
                  VAT
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wide text-slate-500 sm:px-5 sm:text-sm">
                  Brutto
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500 sm:px-5 sm:text-sm">
                  Metoda płatności
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500 sm:px-5 sm:text-sm">
                  Status płatności
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500 sm:px-5 sm:text-sm">
                  Status zewnętrzny
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wide text-slate-500 sm:px-5 sm:text-sm">
                  Akcje
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r) => {
                const st = businessDocStatus({
                  status: r.status,
                  total_received: r.total_received,
                  receiving_status: r.receiving_status,
                  putaway_status: r.putaway_status,
                  relocation_status: r.relocation_status,
                  is_fully_received: r.is_fully_received,
                  is_fully_putaway: r.is_fully_putaway,
                });
                const dt = normalizeWarehouseDocType(r.document_type);
                return (
                  <tr
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => void openDetail(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void openDetail(r.id);
                      }
                    }}
                    className="cursor-pointer border-t border-slate-100 transition-colors odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/80"
                  >
                    <td className="px-4 py-4 font-mono text-lg font-bold tabular-nums text-slate-900 sm:px-5 sm:py-5">
                      #{r.id}
                    </td>
                    <td className="px-4 py-4 sm:px-5 sm:py-5">
                      <Link
                        to={`/goods-orders?edit=${r.delivery_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:text-violet-900"
                      >
                        #{r.delivery_id}
                      </Link>
                    </td>
                    <td className="max-w-[14rem] truncate px-4 py-4 text-slate-800 sm:px-5 sm:py-5" title={r.supplier_name}>
                      {(r.supplier_name || "").trim() || "—"}
                    </td>
                    <td className="px-4 py-4 text-slate-500 sm:px-5 sm:py-5">—</td>
                    <td className="px-4 py-4 sm:px-5 sm:py-5">
                      <DocumentTypeBadge code={dt} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 tabular-nums text-slate-600 sm:px-5 sm:py-5">
                      {formatDateShort(r.created_at)}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums text-slate-800 sm:px-5 sm:py-5">
                      {fmtMoneyCur(r.total_net, r.currency)}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums text-slate-800 sm:px-5 sm:py-5">
                      {fmtMoneyCur(r.total_vat, r.currency)}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums text-slate-800 sm:px-5 sm:py-5">
                      {fmtMoneyCur(r.total_gross, r.currency)}
                    </td>
                    <td className="px-4 py-4 text-slate-500 sm:px-5 sm:py-5">—</td>
                    <td className="px-4 py-4 sm:px-5 sm:py-5">
                      <PaymentNotApplicableBadge />
                    </td>
                    <td className="px-4 py-4 sm:px-5 sm:py-5">
                      <ExternalStatusBadge status={st} />
                    </td>
                    <td className="px-4 py-4 text-right sm:px-5 sm:py-5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap items-center justify-end gap-1" data-print-menu-root>
                        <button
                          type="button"
                          aria-label="Edytuj"
                          title="Edytuj"
                          onClick={() => void openDetail(r.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg leading-none hover:bg-slate-50"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          aria-label="Usuń"
                          title="Usuń"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(r.id);
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-lg leading-none text-rose-900 hover:bg-rose-100"
                        >
                          🗑
                        </button>
                        <div className="relative inline-flex">
                          <button
                            type="button"
                            aria-label="Drukuj"
                            title="Drukuj / PDF"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPrintMenuOpenId(printMenuOpenId === r.id ? null : r.id);
                            }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg leading-none hover:bg-slate-50"
                          >
                            🖨
                          </button>
                          {printMenuOpenId === r.id ? (
                            <div className="absolute right-0 z-[320] mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  printDocumentPdf(r.id);
                                  setPrintMenuOpenId(null);
                                }}
                              >
                                Drukuj
                              </button>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDocumentPdf(r.id);
                                  setPrintMenuOpenId(null);
                                }}
                              >
                                Pobierz PDF
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          aria-label="Duplikuj"
                          title="Duplikuj"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const d = await duplicateStockDocument(tenantId, r.id);
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
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg leading-none hover:bg-slate-50"
                        >
                          📋
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
                </table>
              </div>
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
            className="flex max-h-[min(92vh,calc(100dvh-2rem))] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="shrink-0 border-b border-slate-200 bg-white px-6 pb-5 pt-6">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {detail ? `Dokument magazynowy · ${normalizeWarehouseDocType(detail.document_type)}` : "Dokument magazynowy"}
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                    {detailId != null && detail
                      ? `${normalizeWarehouseDocType(detail.document_type)} ${detailId}`
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
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">Dostawca</h3>
                      <p className="text-lg font-semibold text-slate-900">
                        {(detail.supplier_name || "").trim() || `Dostawca #${detail.supplier_id}`}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">Identyfikator w systemie · #{detail.supplier_id}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">Dokument</h3>
                      <dl className="space-y-3 text-sm">
                        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
                          <dt className="text-slate-500">Typ</dt>
                          <dd className="font-semibold text-slate-900">{detail.document_type}</dd>
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
                        <div className="flex items-center justify-between gap-4 pt-1">
                          <dt className="text-slate-500">Zamówienie</dt>
                          <dd>
                            <Link
                              to={`/goods-orders?edit=${detail.delivery_id}`}
                              className="font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:text-violet-900"
                            >
                              #{detail.delivery_id}
                            </Link>
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">Finanse dokumentu</h3>
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

                  <div ref={docLinesRef} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">Pozycje</h3>
                    {detail.items.length > 0 ? (
                      <>
                        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                          <table className="w-full min-w-[1200px] text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50/90 text-left">
                                <th className="px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Typ
                                </th>
                                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Nazwa
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Zamówiono
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Przyjęto
                                </th>
                                {lineEditEnabled ? (
                                  <th className="px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Nośnik <span className="font-normal normal-case text-slate-400">(sugestia)</span>
                                  </th>
                                ) : null}
                                <th className="px-3 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Jednostka
                                </th>
                                <th className="px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Lokalizacja
                                </th>
                                <th className="px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Status
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Różnica
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Cena netto
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Wartość netto
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.items.map((it) => {
                                const raw = receivedByLineId[it.id] ?? String(it.received_quantity);
                                const recParsed = parseQty(raw);
                                const rec = recParsed ?? it.received_quantity;
                                const diff = rec - it.ordered_quantity;
                                const price = it.purchase_price_net;
                                const val = price != null && Number.isFinite(rec) ? rec * price : null;
                                const ean = (it.product_ean || "").trim();
                                const sku = (it.product_sku || "").trim();
                                return (
                                  <tr key={it.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                                    <td className="px-3 py-4 align-middle">
                                      <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                                        {receiptTypeLabel(it.receipt_line_type)}
                                      </span>
                                    </td>
                                    <td className="px-4 py-4">
                                      <div className="flex items-start gap-3">
                                        <ProductThumb url={wmsReceiptLineImageUrl(it)} />
                                        <div className="min-w-0 flex-1">
                                          <div className="font-semibold leading-snug text-slate-900">
                                            {receiptLineDisplayName(it)}
                                          </div>
                                          <div className="mt-1 text-xs text-slate-500">
                                            EAN {ean || "—"} · SKU {sku || "—"}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-4 py-4 text-right align-middle tabular-nums text-slate-800">
                                      {fmtQty(it.ordered_quantity)}
                                    </td>
                                    <td className="px-4 py-4 text-right align-middle tabular-nums">
                                      {lineEditEnabled ? (
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          className={`${inputClass} inline-block w-[6.5rem]`}
                                          value={receivedByLineId[it.id] ?? ""}
                                          onChange={(e) =>
                                            setReceivedByLineId((prev) => ({ ...prev, [it.id]: e.target.value }))
                                          }
                                          aria-label={`Przyjęto dla pozycji ${it.id}`}
                                        />
                                      ) : (
                                        <span className="text-slate-900">{fmtQty(it.received_quantity)}</span>
                                      )}
                                    </td>
                                    {lineEditEnabled ? (
                                      <td className="px-3 py-4 align-middle">
                                        <div className="flex min-w-[10rem] flex-col gap-2">
                                          {(suggestedCarrierBarcodeByLineId[it.id] ?? "").trim() ? (
                                            <CarrierBadge code={(suggestedCarrierBarcodeByLineId[it.id] ?? "").trim()} />
                                          ) : (
                                            <span className="text-[11px] font-medium text-slate-400">Brak nośnika</span>
                                          )}
                                          <div className="flex flex-wrap gap-1">
                                            <button
                                              type="button"
                                              onClick={() => setAssignPickerLineId(it.id)}
                                              className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase text-amber-950 hover:bg-amber-100"
                                            >
                                              Wybierz
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setCreateCarrierLineId(it.id)}
                                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase text-slate-700 hover:bg-slate-50"
                                            >
                                              + Nowy
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setSuggestedCarrierBarcodeByLineId((prev) => ({
                                                  ...prev,
                                                  [it.id]: "",
                                                }))
                                              }
                                              className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-50"
                                            >
                                              Wyczyść
                                            </button>
                                          </div>
                                          <input
                                            type="text"
                                            className="w-full rounded-lg border border-amber-200 bg-amber-50/40 px-2 py-1.5 font-mono text-[11px] text-amber-950 placeholder:text-amber-700/50 focus:border-amber-400 focus:ring-2 focus:ring-amber-400"
                                            placeholder="Ręcznie: PAL-…"
                                            value={suggestedCarrierBarcodeByLineId[it.id] ?? ""}
                                            onChange={(e) =>
                                              setSuggestedCarrierBarcodeByLineId((prev) => ({
                                                ...prev,
                                                [it.id]: e.target.value,
                                              }))
                                            }
                                            aria-label={`Kod nośnika sugerowanego dla pozycji ${it.id}`}
                                          />
                                        </div>
                                      </td>
                                    ) : null}
                                    <td className="px-3 py-4 text-right align-middle text-slate-700">
                                      {(it.line_unit || "").trim() || "—"}
                                    </td>
                                    <td className="px-3 py-4 align-middle text-xs text-slate-700">{receiptLineLocation(it)}</td>
                                    <td className="px-3 py-4 align-middle text-xs font-medium text-slate-800">
                                      {receiptLineStatus(it)}
                                    </td>
                                    <td
                                      className={`px-4 py-4 text-right align-middle tabular-nums ${diffToneClass(diff)}`}
                                    >
                                      {fmtQty(diff)}
                                    </td>
                                    <td className="px-4 py-4 text-right align-middle tabular-nums text-slate-700">
                                      {price != null ? fmtMoney(price) : "—"}
                                    </td>
                                    <td className="px-4 py-4 text-right align-middle tabular-nums font-medium text-slate-900">
                                      {val != null ? fmtMoney(val) : "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {lineSummary ? (
                          <div className="mt-4 rounded-lg bg-gray-50 p-4">
                            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Podsumowanie</p>
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                              <div>
                                <p className="text-xs text-slate-500">Pozycji</p>
                                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{lineSummary.lineCount}</p>
                              </div>
                              <div className="text-right sm:text-left">
                                <p className="text-xs text-slate-500">Suma zamówiono</p>
                                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                                  {fmtQty(lineSummary.sumOrdered)}
                                </p>
                              </div>
                              <div className="text-right sm:text-left">
                                <p className="text-xs text-slate-500">Suma przyjęto</p>
                                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                                  {fmtQty(lineSummary.sumReceived)}
                                </p>
                              </div>
                              <div className="text-right sm:text-left">
                                <p className="text-xs text-slate-500">Różnica łącznie</p>
                                <p className={`mt-1 text-lg font-bold tabular-nums ${diffToneClass(lineSummary.sumDiff)}`}>
                                  {fmtQty(lineSummary.sumDiff)}
                                </p>
                              </div>
                              <div className="col-span-2 text-right sm:col-span-1 sm:text-left lg:col-span-1">
                                <p className="text-xs text-slate-500">Wartość netto łącznie</p>
                                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                                  {fmtMoney(lineSummary.sumValue)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-slate-600">Brak pozycji na dokumencie.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4 sm:gap-3">
              <button
                type="button"
                onClick={closeDetail}
                disabled={detailBusy}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Zamknij
              </button>
              {detailId != null && detail ? (
                <>
                  <div className="flex flex-wrap items-center gap-1" data-print-menu-root>
                    <button
                      type="button"
                      aria-label="Edytuj pozycje"
                      title="Edytuj pozycje"
                      disabled={detailBusy}
                      onClick={() => docLinesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg leading-none hover:bg-slate-50 disabled:opacity-50"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      aria-label="Usuń dokument"
                      title="Usuń dokument"
                      disabled={detailBusy}
                      onClick={() => setDeleteConfirmId(detailId)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-lg leading-none text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                    >
                      🗑
                    </button>
                    <div className="relative inline-flex">
                      <button
                        type="button"
                        aria-label="Drukuj"
                        title="Drukuj / PDF"
                        disabled={detailBusy}
                        onClick={() => setDetailPrintMenuOpen((v) => !v)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg leading-none hover:bg-slate-50 disabled:opacity-50"
                      >
                        🖨
                      </button>
                      {detailPrintMenuOpen ? (
                        <div className="absolute bottom-full right-0 z-[320] mb-1 w-44 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                            onClick={() => {
                              printDocumentPdf(detailId);
                              setDetailPrintMenuOpen(false);
                            }}
                          >
                            Drukuj
                          </button>
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                            onClick={() => {
                              openDocumentPdf(detailId);
                              setDetailPrintMenuOpen(false);
                            }}
                          >
                            Pobierz PDF
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDuplicateDocument()}
                    disabled={detailBusy}
                    className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-50"
                  >
                    Duplikuj dokument
                  </button>
                </>
              ) : null}
              {canEditMetadata ? (
                <button
                  type="button"
                  onClick={() => void handleSaveMetadata()}
                  disabled={detailBusy || !detail}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
                >
                  {detailBusy ? "Zapisywanie…" : "Zapisz wartości dokumentu"}
                </button>
              ) : null}
              {(isDraft || isWmsCompleteDraft) && isPzDetail ? (
                <>
                  <button
                    type="button"
                    onClick={receiveAll}
                    disabled={detailBusy || !detail || !lineEditEnabled}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    Przyjmij wszystko
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveDraft()}
                    disabled={detailBusy || !detail || !lineEditEnabled}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {detailBusy ? "Zapisywanie…" : "Zapisz ilości"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAccept()}
                    disabled={detailBusy || !detail || !canPostAccept}
                    title={
                      !canPostAccept && detail
                        ? "Najpierw ustaw magazyn (WMS → Przyjęcie). Lokalizacja przyjęcia zostanie uzupełniona automatycznie, jeśli jest dostępna w magazynie."
                        : undefined
                    }
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {detailBusy ? "Przetwarzanie…" : isWmsCompleteDraft ? "Zaksięguj (WMS zakończone)" : "Zatwierdź przyjęcie"}
                  </button>
                </>
              ) : null}
            </footer>
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
