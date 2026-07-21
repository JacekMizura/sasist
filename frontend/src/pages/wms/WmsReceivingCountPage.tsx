import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Box, CheckCircle2, Plus } from "lucide-react";
import { fetchUsers } from "../../api/authApi";
import { getStockDocument, type StockDocumentItemRead, type StockDocumentRead } from "../../api/stockDocumentsApi";
import {
  deleteWmsReceivingPzItem,
  finishWmsReceivingPz,
  postWmsReceivingPzItemMoveCarrier,
  resolveWmsReceivingScan,
} from "../../api/wmsReceivingApi";
import { ReceivingActiveCarrierBar } from "../../components/wms/receiving/ReceivingActiveCarrierBar";
import { ReceivingCarrierAssignModal } from "../../components/wms/receiving/carriers/ReceivingCarrierAssignModal";
import { WmsManualProductModal } from "../../components/wms/WmsManualProductModal";
import { ReceivingCarrierBadge } from "../../components/wms/receiving/carriers/ReceivingCarrierBadge";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { wmsReceiptLineImageUrl } from "../../utils/wmsReceiptLineMedia";
import { documentCreatedByLabel } from "../../utils/documentCreatedBy";
import { WMS_ROUTES } from "./wmsRoutes";
import {
  buildReceivingLineGroups,
  isGhostReceivingLine,
  isWmsExtraReceivingLine,
  getReceivingSiblings,
  receivingLineGroupKey,
  toReceivingCountValue,
  type ReceivingLineGroup,
} from "./wmsReceivingLineGroups";
import { formatWmsListDate } from "./wmsListFormatters";
import { ProductDataCompletionModal } from "../../components/wms/receiving/ProductDataCompletionModal";
import { ReceivingLineCard } from "../../components/wms/receiving/ReceivingLineCard";
import {
  ReceivingExecutionModal,
  type ReceivingExecutionReceivePayload,
} from "../../components/wms/receiving/ReceivingExecutionModal";
import { ReceivingDamageModal } from "../../components/wms/receiving/ReceivingDamageModal";
import { aggregateReceivingLineAudit } from "../../utils/receivingLineAudit";
import {
  ProductLabelPrintModal,
  type ProductForLabel,
} from "../Products/ProductLabelPrintModal";
import type { WmsProductPreviewNavState } from "./wmsPickingFlowTypes";
import { useWmsReceivingCountScan, type ProductDataGateContext } from "./useWmsReceivingCountScan";

const TENANT_STORAGE_KEY = "wms.receiving.tenantId";

function toCountValue(received: number | string | null | undefined): number {
  return toReceivingCountValue(received);
}

function fmtQty(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(n);
}

function pzReceivingHeaderSubtitle(d: StockDocumentRead | null): string {
  if (d == null) return "Weryfikacja towaru";
  const ext = (d as { contractor_name?: string | null }).contractor_name;
  const c = typeof ext === "string" ? ext.trim() : "";
  if (c) return c;
  const s = (d.supplier_name ?? "").trim();
  if (s) return s;
  return "Weryfikacja towaru";
}

function WmsReceivingPageLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white font-sans">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      <p className="mt-4 text-sm font-semibold text-slate-500">Wczytywanie PZ…</p>
    </div>
  );
}

function WmsReceivingErrorState({
  title,
  description,
  onBack,
}: {
  title: string;
  description: string;
  onBack: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-6 font-sans">
      <h1 className="text-center text-xl font-bold text-slate-800">{title}</h1>
      <p className="max-w-md text-center text-sm font-medium text-slate-500">{description}</p>
      <button
        type="button"
        onClick={onBack}
        className="rounded-xl bg-slate-800 px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-900 transition-colors"
      >
        Wróć do listy przyjęć
      </button>
    </div>
  );
}

export default function WmsReceivingCountPage() {
  const { pzId: pzIdParam } = useParams();
  const pzId = Number(pzIdParam);
  const navigate = useNavigate();
  const location = useLocation();
  const tenantIdFromState = (location.state as { tenantId?: number } | null)?.tenantId;

  const [tenantId] = useState(() => tenantIdFromState || Number(localStorage.getItem(TENANT_STORAGE_KEY)) || 1);
  const { showScannerToast, setActiveDocument, setScannerInputDisabled, refocusScannerInput } =
    useWmsScanner();

  const [detail, setDetail] = useState<StockDocumentRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [countedByLineId, setCountedByLineId] = useState<Record<number, number>>({});
  const [lastTouchedAtByLineId, setLastTouchedAtByLineId] = useState<Record<number, number>>({});

  const [receivingModal, setReceivingModal] = useState<StockDocumentItemRead | null>(null);
  const [seedReceiveNowQty, setSeedReceiveNowQty] = useState(1);
  const [receiveNowBump, setReceiveNowBump] = useState<{
    amount: number;
    asCartons: boolean;
    token: number;
  } | null>(null);
  const [cartonSize, setCartonSize] = useState(1);
  const [cartonSizeByGroupKey, setCartonSizeByGroupKey] = useState<Record<string, number>>({});
  const [lineCarrierChoice, setLineCarrierChoice] = useState<number | null>(null);
  const [damageLine, setDamageLine] = useState<StockDocumentItemRead | null>(null);
  const [scanFlashKey, setScanFlashKey] = useState<string | null>(null);
  const [adminNameById, setAdminNameById] = useState<Map<number, string>>(() => new Map());
  const scanFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { warehouse } = useWarehouse();
  const [assignCarrierOpen, setAssignCarrierOpen] = useState(false);
  const [newProductScan, setNewProductScan] = useState<string | null>(null);
  const [manualProductOpen, setManualProductOpen] = useState(false);
  type ProductDataGateItem = ProductDataGateContext & { resolve: (proceed: boolean) => void };
  const productDataGateQueueRef = useRef<ProductDataGateItem[]>([]);
  const [productDataGate, setProductDataGate] = useState<ProductDataGateItem | null>(null);
  const [labelPrintProduct, setLabelPrintProduct] = useState<ProductForLabel | null>(null);

  const onProductDataGate = useCallback((ctx: ProductDataGateContext) => {
    return new Promise<boolean>((resolve) => {
      const item: ProductDataGateItem = { ...ctx, resolve };
      setProductDataGate((active) => {
        if (active == null) return item;
        productDataGateQueueRef.current.push(item);
        return active;
      });
    });
  }, []);

  const closeProductDataGate = useCallback((proceed: boolean) => {
    setProductDataGate((active) => {
      active?.resolve(proceed);
      return productDataGateQueueRef.current.shift() ?? null;
    });
  }, []);

  const pzIdValid = Number.isFinite(pzId) && pzId >= 1;

  const load = useCallback(async () => {
    if (!pzIdValid) {
      setDetail(null);
      setCountedByLineId({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const d = await getStockDocument(tenantId, pzId, warehouse?.id ?? undefined);
      setDetail(d);
      const init: Record<number, number> = {};
      for (const it of d.items ?? []) init[it.id] = toCountValue(it.received_quantity);
      setCountedByLineId(init);
    } catch {
      setDetail(null);
      setCountedByLineId({});
      showScannerToast("Błąd wczytywania PZ");
    } finally {
      setLoading(false);
    }
  }, [tenantId, pzId, pzIdValid, showScannerToast, warehouse?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetchUsers()
      .then((users) => {
        const m = new Map<number, string>();
        for (const u of users) {
          const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.login;
          m.set(u.id, name);
        }
        setAdminNameById(m);
      })
      .catch(() => {
        /* operator labels optional */
      });
  }, []);

  useEffect(() => {
    if (!pzIdValid) return;
    setActiveDocument({ kind: "pz", pzId, tenantId });
    return () => setActiveDocument(null);
  }, [pzId, pzIdValid, tenantId, setActiveDocument]);

  useEffect(() => {
    setScannerInputDisabled(
      busy ||
        detail == null ||
        assignCarrierOpen ||
        newProductScan != null ||
        manualProductOpen ||
        productDataGate != null ||
        labelPrintProduct != null ||
        damageLine != null,
    );
  }, [
    busy,
    detail,
    assignCarrierOpen,
    newProductScan,
    manualProductOpen,
    productDataGate,
    labelPrintProduct,
    damageLine,
    setScannerInputDisabled,
  ]);

  const openModalRef = useRef<
    (it: StockDocumentItemRead, opts?: { initialQty?: number; freshLot?: boolean }) => void
  >(() => {});

  const bumpReceiveNow = useCallback((opts: { amount: number; asCartons: boolean }) => {
    setReceiveNowBump({
      amount: Math.max(1, Math.floor(opts.amount) || 1),
      asCartons: Boolean(opts.asCartons),
      token: Date.now(),
    });
  }, []);

  const {
    activeCarrierId,
    activeCarrierCode,
    clearActiveCarrier,
    receiveLoose,
    applyReceive,
  } = useWmsReceivingCountScan({
    tenantId,
    pzId,
    canEdit: (detail?.status ?? "").trim() === "draft",
    detail,
    setDetail,
    setCountedByLineId,
    setLastTouchedAtByLineId,
    lastTouchedAtByLineId,
    busy,
    setBusy,
    receivingModalOpen: receivingModal != null,
    receivingExecutionLineId: receivingModal?.id ?? null,
    assignCarrierOpen: assignCarrierOpen,
    newProductModalOpen: newProductScan != null || manualProductOpen,
    productDataModalOpen: productDataGate != null,
    onExecutionCarrierPicked: (carrierId) => setLineCarrierChoice(carrierId),
    onOpenLineModal: (it, opts) => openModalRef.current(it, opts),
    onBumpReceiveNow: bumpReceiveNow,
    onRequestNewProduct: (ean) => setNewProductScan(ean),
    onProductDataGate,
  });

  const closeReceivingModal = useCallback(() => {
    setReceivingModal(null);
    setSeedReceiveNowQty(1);
    setReceiveNowBump(null);
    setLineCarrierChoice(null);
    setCartonSize(1);
    window.setTimeout(() => refocusScannerInput(), 0);
  }, [refocusScannerInput]);

  const flashLineGroup = useCallback((it: StockDocumentItemRead) => {
    const key = receivingLineGroupKey(it);
    setScanFlashKey(key);
    if (scanFlashTimerRef.current) clearTimeout(scanFlashTimerRef.current);
    scanFlashTimerRef.current = setTimeout(() => setScanFlashKey(null), 1200);
  }, []);

  const openProductPreview = useCallback(
    (it: StockDocumentItemRead) => {
      const productId = Number(it.product_id);
      if (!Number.isFinite(productId) || productId <= 0) return;
      const nav: WmsProductPreviewNavState = {
        returnPath: WMS_ROUTES.receivingPz(pzId),
      };
      navigate(WMS_ROUTES.productPreview(productId), { state: nav });
    },
    [navigate, pzId, tenantId],
  );

  const openModal = useCallback(
    (it: StockDocumentItemRead, opts?: { initialQty?: number; freshLot?: boolean }) => {
      flashLineGroup(it);
      setReceivingModal(it);
      setSeedReceiveNowQty(Math.max(1, Math.floor(Number(opts?.initialQty) || 1)));
      setReceiveNowBump(null);
      setLastTouchedAtByLineId((p) => ({ ...p, [it.id]: Date.now() }));
      const rc = detail?.receiving_carriers ?? [];
      if (activeCarrierId != null && rc.some((c) => c.carrier_id === activeCarrierId)) {
        setLineCarrierChoice(activeCarrierId);
      } else {
        const sug = it.suggested_warehouse_carrier_id ?? null;
        if (sug != null && rc.some((c) => c.carrier_id === sug)) {
          setLineCarrierChoice(sug);
        } else {
          setLineCarrierChoice(null);
        }
      }
      const gKey = receivingLineGroupKey(it);
      const ean = (it.product_ean ?? "").trim();
      if (ean) {
        void resolveWmsReceivingScan(tenantId, ean)
          .then((res) => {
            const size = Math.max(1, Math.floor(Number(res.default_quantity) || 1));
            setCartonSize(size);
            setCartonSizeByGroupKey((p) => ({ ...p, [gKey]: size }));
          })
          .catch(() => {
            setCartonSize(1);
            setCartonSizeByGroupKey((p) => ({ ...p, [gKey]: 1 }));
          });
      } else {
        setCartonSize(1);
        setCartonSizeByGroupKey((p) => ({ ...p, [gKey]: 1 }));
      }
      void opts?.freshLot;
    },
    [detail?.receiving_carriers, activeCarrierId, flashLineGroup, tenantId],
  );

  openModalRef.current = openModal;

  const handleNewProductCreated = useCallback(
    (doc: StockDocumentRead, productId: number) => {
      setDetail(doc);
      const init: Record<number, number> = {};
      for (const it of doc.items ?? []) init[it.id] = toCountValue(it.received_quantity);
      setCountedByLineId(init);
      const lines = (doc.items ?? []).filter((it) => it.product_id === productId);
      const line = lines.length ? [...lines].sort((a, b) => b.id - a.id)[0] : null;
      setNewProductScan(null);
      setManualProductOpen(false);
      if (!line) return;

      void (async () => {
        const proceed = await onProductDataGate({
          productId,
          productName: line.product_name,
          productEan: line.product_ean,
          imageUrl: wmsReceiptLineImageUrl(line) ?? undefined,
          missingLabels: [],
          forceAllFields: true,
        });
        if (!proceed) return;

        const needsLot =
          Boolean(line.track_serial) || Boolean(line.track_batch) || Boolean(line.track_expiry);
        const already = toCountValue(line.received_quantity);
        if (needsLot) {
          openModal(line, { initialQty: Math.max(1, already), freshLot: true });
          return;
        }
        if (already > 0) {
          showScannerToast(`Dodano do PZ · ${fmtQty(already)} szt.`);
          return;
        }
        openModal(line, { initialQty: 1, freshLot: true });
      })();
    },
    [onProductDataGate, openModal, showScannerToast],
  );

  const executionLine = useMemo(() => {
    if (receivingModal == null) return null;
    return (detail?.items ?? []).find((it) => it.id === receivingModal.id) ?? receivingModal;
  }, [receivingModal, detail?.items]);

  const executionGroup = useMemo((): ReceivingLineGroup | null => {
    if (executionLine == null || !detail?.items?.length) return null;
    const key = receivingLineGroupKey(executionLine);
    return buildReceivingLineGroups(detail.items, { includePendingProducts: true }).find((g) => g.key === key) ?? null;
  }, [executionLine, detail?.items]);

  const executionCartonSize =
    executionGroup != null ? cartonSizeByGroupKey[executionGroup.key] ?? cartonSize : cartonSize;

  const handleExecutionReceive = useCallback(
    async (payload: ReceivingExecutionReceivePayload) => {
      const line = executionLine;
      if (line == null || busy || !pzIdValid) return false;
      const ok = await applyReceive({
        line,
        addQty: payload.addQty,
        cartonsDelta: payload.cartonsDelta,
        looseDelta: payload.looseDelta,
        warehouseCarrierId: payload.warehouseCarrierId,
        serialNumber: payload.serialNumber ?? null,
        expiryDate: payload.expiryDate,
        batchNumber: payload.batchNumber,
      });
      if (ok) {
        const abs = Math.abs(payload.addQty);
        showScannerToast(
          payload.addQty < 0
            ? `−${fmtQty(abs)} szt. skorygowano`
            : `+${fmtQty(abs)} szt. przyjęto`,
        );
        closeReceivingModal();
      }
      return ok;
    },
    [executionLine, busy, pzIdValid, applyReceive, showScannerToast, closeReceivingModal],
  );

  const extraLineCount = useMemo(() => {
    const items = detail?.items ?? [];
    return items.filter((it) => isWmsExtraReceivingLine(it)).length;
  }, [detail?.items]);

  const lineGroups = useMemo((): ReceivingLineGroup[] => {
    const items = detail?.items ?? [];
    if (!items.length) return [];
    return buildReceivingLineGroups(items, { includePendingProducts: true }).sort(
      (a, b) =>
        (lastTouchedAtByLineId[b.primary.id] || 0) - (lastTouchedAtByLineId[a.primary.id] || 0) ||
        b.totalReceived - a.totalReceived,
    );
  }, [detail, lastTouchedAtByLineId]);

  const modalSiblings = useMemo(() => {
    if (!executionLine || !detail?.items) return [];
    return getReceivingSiblings(detail.items, executionLine);
  }, [executionLine, detail?.items]);

  const handleLineCarrierChange = useCallback(
    async (carrierId: number | null) => {
      const line = executionLine;
      if (line == null) return;
      const current = line.warehouse_carrier_id ?? null;
      if (current === carrierId) {
        setLineCarrierChoice(carrierId);
        return;
      }
      const received = toCountValue(line.received_quantity);
      if (received <= 0) {
        setLineCarrierChoice(carrierId);
        return;
      }
      if (busy || !pzIdValid) return;
      setBusy(true);
      try {
        const doc = await postWmsReceivingPzItemMoveCarrier(tenantId, pzId, line.id, {
          warehouse_carrier_id: carrierId,
        });
        setDetail(doc);
        const init: Record<number, number> = {};
        for (const it of doc.items ?? []) init[it.id] = toCountValue(it.received_quantity);
        setCountedByLineId(init);
        const probeKey = receivingLineGroupKey({
          ...line,
          warehouse_carrier_id: carrierId,
        } as StockDocumentItemRead);
        const moved =
          (doc.items ?? []).find(
            (it) => receivingLineGroupKey(it) === probeKey && !isGhostReceivingLine(it),
          ) ?? null;
        if (moved) setReceivingModal(moved);
        setLineCarrierChoice(carrierId);
        showScannerToast("Przeniesiono na nośnik");
      } catch {
        showScannerToast("Nie udało się przenieść na nośnik");
      } finally {
        setBusy(false);
      }
    },
    [executionLine, busy, pzIdValid, tenantId, pzId, showScannerToast],
  );

  const warehouseId = warehouse?.id ?? detail?.warehouse_id ?? null;

  const backToList = () => navigate(WMS_ROUTES.receiving);

  if (!pzIdValid) {
    return (
      <WmsReceivingErrorState
        title="Nieprawidłowy adres PZ"
        description="Brak poprawnego numeru dokumentu w adresie URL."
        onBack={backToList}
      />
    );
  }

  if (loading) {
    return <WmsReceivingPageLoader />;
  }

  if (detail == null) {
    return (
      <WmsReceivingErrorState
        title="Nie udało się załadować dokumentu PZ"
        description="Dokument nie istnieje lub wystąpił błąd ładowania."
        onBack={backToList}
      />
    );
  }

  const doc = detail;
  const headerSubtitle = pzReceivingHeaderSubtitle(doc);
  const docStatus = (doc.status ?? "").trim();
  const canEditLines = docStatus === "draft";
  const docNumberLabel =
    (doc.document_number || "").trim() ||
    String((doc as { number?: string | null }).number || "").trim() ||
    `PZ #${pzId}`;

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-800 pb-24">
      
      {/* HEADER W PEŁNEJ SZEROKOŚCI */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm w-full">
        <div className="w-full px-4 h-16 flex items-center justify-between gap-4">
          
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={backToList}
              className="p-2 -ml-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors shrink-0"
            >
              <ArrowLeft size={22} />
            </button>
            <div className="hidden sm:block min-w-0">
              <div className="flex flex-col min-w-0">
                <h1 className="text-lg font-bold text-slate-900 leading-tight break-words [overflow-wrap:anywhere]">
                  {docNumberLabel}
                  {(doc as { external_document_number?: string | null }).external_document_number?.trim()
                    ? ` · ${String((doc as { external_document_number?: string | null }).external_document_number).trim()}`
                    : null}
                </h1>
                <span className="text-xs text-slate-500 break-words">
                  {headerSubtitle} • Utworzył: {documentCreatedByLabel(doc.created_by)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 flex justify-center max-w-sm">
            {canEditLines ? (
               <ReceivingActiveCarrierBar
                 activeCode={activeCarrierCode}
                 onReceiveLoose={receiveLoose}
                 onClear={clearActiveCarrier}
                 disabled={busy}
               />
            ) : null}
          </div>
          
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <p className="text-[11px] font-medium text-slate-500 leading-none mb-1">SUMA PRZELICZONA</p>
              <div className="flex items-baseline gap-1 justify-end">
                <p className="text-2xl font-bold text-indigo-600 leading-none">
                  {fmtQty(Object.values(countedByLineId).reduce((a, b) => a + b, 0))}
                </p>
                <p className="text-sm font-medium text-indigo-600/80">szt.</p>
              </div>
            </div>
          </div>

        </div>
      </header>

      {/* GŁÓWNA ZAWARTOŚĆ W PEŁNEJ SZEROKOŚCI */}
      <main className="w-full px-4 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {lineGroups.map((g, idx) => (
            <ReceivingLineCard
              key={g.primary.id}
              index={idx + 1}
              it={g.primary}
              siblings={g.siblings}
              count={g.totalReceived}
              cartonSize={cartonSizeByGroupKey[g.key] ?? 1}
              canEdit={canEditLines}
              busy={busy}
              scanFlash={scanFlashKey === g.key}
              audit={aggregateReceivingLineAudit(g.siblings, adminNameById)}
              onOpenExecution={() => openModal(g.primary)}
              onOpenProductPreview={() => openProductPreview(g.primary)}
              onPrintLabel={() => {
                const pid = Number(g.primary.product_id);
                if (!Number.isFinite(pid) || pid <= 0) return;
                setLabelPrintProduct({ id: pid, tenant_id: tenantId });
              }}
              onMarkDamage={() => {
                const dockAvail = Math.max(
                  0,
                  Math.floor(
                    toCountValue(g.primary.received_quantity) -
                      toCountValue(g.primary.quantity_putaway),
                  ),
                );
                if (dockAvail < 1) {
                  showScannerToast("Brak ilości na DOCK-IN do oznaczenia jako wada");
                  return;
                }
                setDamageLine(g.primary);
              }}
              onEditReceivingAdmin={() => openModal(g.primary)}
              onMoveToCarrier={() => openModal(g.primary)}
              onRemoveFromDocument={() => {
                if (!canEditLines || busy || !pzIdValid) return;
                const line = g.primary;
                if (!isWmsExtraReceivingLine(line) && !isGhostReceivingLine(line)) {
                  showScannerToast("Nie można usunąć pozycji z dokumentu źródłowego");
                  return;
                }
                const put = toCountValue(line.quantity_putaway);
                if (put > 0) {
                  showScannerToast(
                    "Nie można usunąć pozycji, ponieważ część towaru została już rozlokowana. Najpierw wykonaj korektę stanu lub odpowiednią operację magazynową.",
                  );
                  return;
                }
                const received = toCountValue(line.received_quantity);
                if (received > 0) {
                  const ok = window.confirm(
                    `Wycofaj przyjęcie (${fmtQty(received)} szt. z DOCK-IN) i usuń pozycję z dokumentu?`,
                  );
                  if (!ok) return;
                }
                setBusy(true);
                void deleteWmsReceivingPzItem(tenantId, pzId, line.id)
                  .then((doc) => {
                    setDetail(doc);
                    const init: Record<number, number> = {};
                    for (const it of doc.items ?? []) init[it.id] = toCountValue(it.received_quantity);
                    setCountedByLineId(init);
                    showScannerToast(
                      received > 0
                        ? "Wycofano przyjęcie i usunięto pozycję"
                        : "Usunięto produkt z dokumentu",
                    );
                  })
                  .catch((e) => {
                    const msg =
                      e && typeof e === "object" && "response" in e
                        ? String(
                            (e as { response?: { data?: { detail?: string } } }).response?.data
                              ?.detail ?? "",
                          )
                        : "";
                    showScannerToast(msg.trim() || "Nie udało się usunąć pozycji");
                  })
                  .finally(() => setBusy(false));
              }}
              onShowHistory={() => {
                /* Historia dostępna w pełnym dokumencie PZ — nie w WMS operacyjnym. */
              }}
            />
          ))}
        </div>
      </main>

      {/* FOOTER W PEŁNEJ SZEROKOŚCI */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-200 p-4 z-30 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)] w-full">
        <div className="w-full flex flex-col sm:flex-row justify-center items-center gap-4">
          <button
            type="button"
            disabled={!canEditLines || busy}
            onClick={() => setManualProductOpen(true)}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg border border-indigo-200 text-indigo-700 font-medium hover:bg-indigo-50 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Plus size={18} />
            Dodaj produkt ręcznie
          </button>
          
          <button
            type="button"
            disabled={!canEditLines || busy}
            onClick={() => setAssignCarrierOpen(true)}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg border border-amber-200 text-amber-700 font-medium hover:bg-amber-50 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Plus size={18} />
            Dodaj nośnik
          </button>

          <button
            type="button"
            onClick={() => {
              finishWmsReceivingPz(tenantId, pzId, {
                items: Object.entries(countedByLineId).map(([id, q]) => ({
                  id: Number(id),
                  received_quantity: q,
                })),
              })
                .then(() => navigate(WMS_ROUTES.receiving))
                .catch(() => showScannerToast("Błąd zamykania przyjęcia"));
            }}
            className="w-full sm:w-auto px-8 py-2.5 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-900 transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={18} />
            Zakończ przyjęcie
          </button>
        </div>
      </footer>

      {/* MODALS - bez zmian */}
      {executionLine != null ? (
        <ReceivingExecutionModal
          line={executionLine}
          siblings={modalSiblings}
          activeCarrierCode={activeCarrierCode}
          carriers={doc.receiving_carriers ?? []}
          lineCarrierChoice={lineCarrierChoice}
          onLineCarrierChange={handleLineCarrierChange}
          cartonSize={executionCartonSize}
          busy={busy}
          onClose={closeReceivingModal}
          onReceive={handleExecutionReceive}
          onMarkDamage={() => {
            const dockAvail = Math.max(
              0,
              Math.floor(
                toCountValue(executionLine.received_quantity) -
                  toCountValue(executionLine.quantity_putaway),
              ),
            );
            if (dockAvail < 1) {
              showScannerToast("Brak ilości na DOCK-IN do oznaczenia jako wada");
              return;
            }
            setDamageLine(executionLine);
            closeReceivingModal();
          }}
          adminMode={false}
          onToggleAdminMode={() => {}}
          onRequireAdminMode={() => {}}
          showDocumentControl={false}
          seedReceiveNowQty={seedReceiveNowQty}
          receiveNowBump={receiveNowBump}
        />
      ) : null}

      {damageLine != null && warehouseId != null ? (
        <ReceivingDamageModal
          tenantId={tenantId}
          pzId={pzId}
          line={damageLine}
          warehouseId={warehouseId}
          maxQty={Math.max(
            0,
            toCountValue(damageLine.received_quantity) - toCountValue(damageLine.quantity_putaway),
          )}
          onClose={() => setDamageLine(null)}
          onSaved={() => {
            setDamageLine(null);
            void load();
          }}
          showToast={showScannerToast}
        />
      ) : null}

      {productDataGate ? (
        <ProductDataCompletionModal
          open
          tenantId={tenantId}
          productId={productDataGate.productId}
          productName={productDataGate.productName}
          productEan={productDataGate.productEan}
          imageUrl={productDataGate.imageUrl}
          missingLabels={productDataGate.missingLabels}
          forceAllFields={productDataGate.forceAllFields}
          onSkip={() => closeProductDataGate(true)}
          onSaved={() => closeProductDataGate(true)}
        />
      ) : null}

      <WmsManualProductModal
        variant="pz"
        open={newProductScan != null}
        tenantId={tenantId}
        pzId={pzId}
        initialEan={newProductScan ?? ""}
        onClose={() => setNewProductScan(null)}
        onCreated={handleNewProductCreated}
      />
      <WmsManualProductModal
        variant="pz"
        open={manualProductOpen}
        tenantId={tenantId}
        pzId={pzId}
        onClose={() => setManualProductOpen(false)}
        onCreated={handleNewProductCreated}
      />

      <ProductLabelPrintModal product={labelPrintProduct} onClose={() => setLabelPrintProduct(null)} />

      <ReceivingCarrierAssignModal
        tenantId={tenantId}
        pzId={pzId}
        open={assignCarrierOpen}
        onClose={() => setAssignCarrierOpen(false)}
        onAttached={() => void load()}
      />
    </div>
  );
}