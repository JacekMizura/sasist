import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  acceptStockDocument,
  deleteStockDocument,
  duplicateStockDocument,
  getStockDocument,
  patchStockDocumentItems,
  patchStockDocumentMetadata,
  type StockDocumentRead,
} from "../../../api/stockDocumentsApi";
import {
  warehouseDetailListValueNetFormatted,
  type WarehouseStockDocumentDetailViewProps,
} from "../../../components/documents/warehouse/WarehouseStockDocumentDetailView";
import { useDocumentTemplatePrint } from "../../../hooks/useDocumentTemplatePrint";
import { useQueuePrint } from "../../../hooks/useQueuePrint";
import { stockKindFromType } from "../../../utils/documentTemplatePrint";
import { listValueNet } from "../warehouseDocumentHelpers";
import {
  detailPath,
  segmentFromStockDocumentType,
} from "../warehouseDocumentRoutePaths";
import type { WarehouseDocumentType } from "../warehouseDocumentsUi";
import {
  computeDetailBizStatus,
  computeDetailDerived,
  computeLineSummary,
  fmtMoneyCur,
  getDetailListConfig,
  WAREHOUSE_STOCK_DOC_INPUT_CLASS,
} from "./warehouseStockDocumentDetailComputed";
import {
  apiErrorMessage,
  buildPatchItems,
  enrichLineItemsWithCarriers,
  parseOptionalMoney,
  receiveAllQuantities,
  shouldApplyCarrierColumn,
  syncLineStateFromDocument,
} from "./warehouseStockDocumentDetailMutations";

export type UseWarehouseStockDocumentDetailParams = {
  documentId: number;
  tenantId: number;
  warehouseId: number;
  docTypeFallback: WarehouseDocumentType;
  onClose?: () => void;
  onListRefresh?: () => void;
};

export type WarehouseStockDocumentDetailActions = {
  refresh: () => Promise<void>;
  receiveAll: () => void;
  saveDraft: () => Promise<void>;
  accept: () => Promise<void>;
  saveMetadata: () => Promise<void>;
  duplicate: () => Promise<void>;
  openDeleteConfirm: () => void;
  closeDeleteConfirm: () => void;
  confirmDelete: () => Promise<void>;
  openDocumentPdf: () => void;
  printDocumentPdf: () => void;
  togglePrintMenu: () => void;
  closePrintMenu: () => void;
};

export type WarehouseStockDocumentDetailState = {
  detailBusy: boolean;
  deleteConfirmOpen: boolean;
  deleteBusy: boolean;
  detailPrintMenuOpen: boolean;
  metaCurrency: string;
  metaNet: string;
  metaGross: string;
  receivedByLineId: Record<number, string>;
  suggestedCarrierBarcodeByLineId: Record<number, string>;
  assignPickerLineId: number | null;
  createCarrierLineId: number | null;
};

export function useWarehouseStockDocumentDetail({
  documentId,
  tenantId,
  warehouseId,
  docTypeFallback,
  onClose,
  onListRefresh,
}: UseWarehouseStockDocumentDetailParams) {
  const navigate = useNavigate();
  const { requestPrint: requestStockDocumentPrint, pickerModal: stockDocumentPickerModal } = useDocumentTemplatePrint({
    tenantId,
    autoPrint: false,
  });
  const { queueStockDocument, busy: queuePrintBusy } = useQueuePrint({ tenantId, warehouseId });

  const [detail, setDetail] = useState<StockDocumentRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receivedByLineId, setReceivedByLineId] = useState<Record<number, string>>({});
  const [suggestedCarrierBarcodeByLineId, setSuggestedCarrierBarcodeByLineId] = useState<Record<number, string>>({});
  const [assignPickerLineId, setAssignPickerLineId] = useState<number | null>(null);
  const [createCarrierLineId, setCreateCarrierLineId] = useState<number | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [metaCurrency, setMetaCurrency] = useState("PLN");
  const [metaNet, setMetaNet] = useState("");
  const [metaGross, setMetaGross] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [detailPrintMenuOpen, setDetailPrintMenuOpen] = useState(false);
  const docLinesRef = useRef<HTMLDivElement | null>(null);

  const applyDocumentToLineState = useCallback((doc: StockDocumentRead) => {
    const synced = syncLineStateFromDocument(doc);
    setReceivedByLineId(synced.receivedByLineId);
    setSuggestedCarrierBarcodeByLineId(synced.suggestedCarrierBarcodeByLineId);
  }, []);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getStockDocument(tenantId, documentId, warehouseId);
      setDetail(d);
      applyDocumentToLineState(d);
    } catch {
      setError("Nie udało się wczytać dokumentu.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [applyDocumentToLineState, documentId, tenantId, warehouseId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!detail) return;
    setMetaCurrency((detail.currency || "PLN").trim() || "PLN");
    setMetaNet(detail.total_net != null ? String(detail.total_net) : "");
    setMetaGross(detail.total_gross != null ? String(detail.total_gross) : "");
  }, [detail]);

  useEffect(() => {
    if (!detailPrintMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (el.closest("[data-print-menu-root]")) return;
      if (el.closest("[data-wh-doc-floating-menu]")) return;
      setDetailPrintMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [detailPrintMenuOpen]);

  const derived = useMemo(() => computeDetailDerived(detail, docTypeFallback), [detail, docTypeFallback]);
  const detailBizStatus = useMemo(
    () => computeDetailBizStatus(detail, derived.canPostAccept),
    [detail, derived.canPostAccept],
  );
  const lineSummary = useMemo(
    () => computeLineSummary(detail, receivedByLineId, derived.isWzDetail),
    [detail, receivedByLineId, derived.isWzDetail],
  );
  const detailListConfig = useMemo(() => getDetailListConfig(derived.detailDocType), [derived.detailDocType]);

  const resolveItemsPayload = useCallback(
    async (built: { ok: true; items: { id: number; received_quantity: number }[] }) => {
      if (!detail || !shouldApplyCarrierColumn(detail)) return built.items;
      const enriched = await enrichLineItemsWithCarriers(tenantId, built.items, suggestedCarrierBarcodeByLineId);
      if (!enriched.ok) {
        window.alert(enriched.msg);
        return null;
      }
      return enriched.items;
    },
    [detail, suggestedCarrierBarcodeByLineId, tenantId],
  );

  const receiveAll = useCallback(() => {
    if (!detail) return;
    setReceivedByLineId(receiveAllQuantities(detail));
  }, [detail]);

  const saveDraft = useCallback(async () => {
    if (!detail) return;
    const built = buildPatchItems(detail, receivedByLineId);
    if (!built.ok) {
      window.alert(built.msg);
      return;
    }
    const itemsPayload = await resolveItemsPayload(built);
    if (itemsPayload == null) return;
    setDetailBusy(true);
    try {
      const updated = await patchStockDocumentItems(tenantId, documentId, { items: itemsPayload });
      setDetail(updated);
      applyDocumentToLineState(updated);
      onListRefresh?.();
    } catch (e: unknown) {
      window.alert(apiErrorMessage(e, "Nie udało się zapisać zmian."));
    } finally {
      setDetailBusy(false);
    }
  }, [applyDocumentToLineState, detail, documentId, onListRefresh, receivedByLineId, resolveItemsPayload, tenantId]);

  const accept = useCallback(async () => {
    if (!detail) return;
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
      const built = buildPatchItems(detail, receivedByLineId);
      if (!built.ok) {
        window.alert(built.msg);
        return;
      }
      linePatch = await resolveItemsPayload(built);
      if (linePatch == null) return;
    }
    setDetailBusy(true);
    try {
      if (linePatch) {
        await patchStockDocumentItems(tenantId, documentId, { items: linePatch });
      }
      const updated = await acceptStockDocument(tenantId, documentId);
      setDetail(updated);
      applyDocumentToLineState(updated);
      onListRefresh?.();
      if (updated.status === "posted") {
        onClose?.();
      }
    } catch (e: unknown) {
      window.alert(apiErrorMessage(e, "Nie udało się zatwierdzić przyjęcia."));
    } finally {
      setDetailBusy(false);
    }
  }, [
    applyDocumentToLineState,
    detail,
    documentId,
    onClose,
    onListRefresh,
    receivedByLineId,
    resolveItemsPayload,
    tenantId,
  ]);

  const saveMetadata = useCallback(async () => {
    if (!detail) return;
    setDetailBusy(true);
    try {
      const updated = await patchStockDocumentMetadata(tenantId, documentId, {
        currency: metaCurrency.trim() || undefined,
        total_net: parseOptionalMoney(metaNet),
        total_gross: parseOptionalMoney(metaGross),
      });
      setDetail(updated);
      onListRefresh?.();
    } catch (e: unknown) {
      window.alert(apiErrorMessage(e, "Nie udało się zapisać metadanych."));
    } finally {
      setDetailBusy(false);
    }
  }, [detail, documentId, metaCurrency, metaGross, metaNet, onListRefresh, tenantId]);

  const duplicate = useCallback(async () => {
    if (!detail) return;
    setDetailBusy(true);
    try {
      const newDoc = await duplicateStockDocument(tenantId, documentId);
      onListRefresh?.();
      const segment = segmentFromStockDocumentType(newDoc.document_type ?? docTypeFallback);
      if (segment === "z-pz") {
        navigate(`/documents/warehouse/z-pz?id=${newDoc.id}`);
      } else {
        navigate(detailPath(segment, newDoc.id));
      }
    } catch (e: unknown) {
      window.alert(apiErrorMessage(e, "Nie udało się zduplikować dokumentu."));
    } finally {
      setDetailBusy(false);
    }
  }, [detail, documentId, docTypeFallback, navigate, onListRefresh, tenantId]);

  const confirmDelete = useCallback(async () => {
    setDeleteBusy(true);
    try {
      await deleteStockDocument(tenantId, documentId);
      setDeleteConfirmOpen(false);
      onClose?.();
    } catch {
      window.alert("Błąd podczas usuwania dokumentu");
    } finally {
      setDeleteBusy(false);
    }
  }, [documentId, onClose, tenantId]);

  const openDocumentPdf = useCallback(() => {
    const kindCode = stockKindFromType(detail?.document_type ?? docTypeFallback);
    void requestStockDocumentPrint({ kind: "stock_document", documentId, kindCode }, { autoPrint: false });
  }, [detail?.document_type, docTypeFallback, documentId, requestStockDocumentPrint]);

  const printDocumentPdf = useCallback(() => {
    void queueStockDocument(documentId, warehouseId);
  }, [documentId, queueStockDocument, warehouseId]);

  const actions: WarehouseStockDocumentDetailActions = useMemo(
    () => ({
      refresh: loadDetail,
      receiveAll,
      saveDraft,
      accept,
      saveMetadata,
      duplicate,
      openDeleteConfirm: () => setDeleteConfirmOpen(true),
      closeDeleteConfirm: () => setDeleteConfirmOpen(false),
      confirmDelete,
      openDocumentPdf,
      printDocumentPdf,
      togglePrintMenu: () => setDetailPrintMenuOpen((v) => !v),
      closePrintMenu: () => setDetailPrintMenuOpen(false),
    }),
    [
      accept,
      confirmDelete,
      duplicate,
      loadDetail,
      openDocumentPdf,
      printDocumentPdf,
      receiveAll,
      saveDraft,
      saveMetadata,
    ],
  );

  const state: WarehouseStockDocumentDetailState = {
    detailBusy,
    deleteConfirmOpen,
    deleteBusy,
    detailPrintMenuOpen,
    metaCurrency,
    metaNet,
    metaGross,
    receivedByLineId,
    suggestedCarrierBarcodeByLineId,
    assignPickerLineId,
    createCarrierLineId,
  };

  const listValueNetFormatted = detail
    ? warehouseDetailListValueNetFormatted(detail, derived.detailDocType, fmtMoneyCur, listValueNet)
    : undefined;

  const viewProps: WarehouseStockDocumentDetailViewProps = {
    layout: "page",
    detailLoading: loading,
    detailErr: error,
    detailId: documentId,
    detail,
    detailDocType: derived.detailDocType,
    detailBizStatus,
    detailListConfig,
    isDraft: derived.isDraft,
    isPzDetail: derived.isPzDetail,
    isWzDetail: derived.isWzDetail,
    editMode: derived.editMode,
    lineEditEnabled: derived.lineEditEnabled,
    canPostAccept: derived.canPostAccept,
    canEditMetadata: derived.canEditMetadata,
    isWmsCompleteDraft: derived.isWmsCompleteDraft,
    detailBusy: detailBusy || queuePrintBusy,
    metaCurrency,
    metaNet,
    metaGross,
    onMetaCurrencyChange: setMetaCurrency,
    onMetaNetChange: setMetaNet,
    onMetaGrossChange: setMetaGross,
    fmtMoneyCur,
    listValueNetFormatted,
    inputClass: WAREHOUSE_STOCK_DOC_INPUT_CLASS,
    receivedByLineId,
    suggestedCarrierBarcodeByLineId,
    onReceivedChange: (lineId, value) => setReceivedByLineId((prev) => ({ ...prev, [lineId]: value })),
    onSuggestedCarrierChange: (lineId, value) =>
      setSuggestedCarrierBarcodeByLineId((prev) => ({ ...prev, [lineId]: value })),
    onAssignCarrier: setAssignPickerLineId,
    onCreateCarrier: setCreateCarrierLineId,
    onClearCarrier: (lineId) => setSuggestedCarrierBarcodeByLineId((prev) => ({ ...prev, [lineId]: "" })),
    lineSummary,
    tenantId,
    onSalesBlockUpdated: () => void loadDetail(),
    docLinesRef,
    detailPrintMenuOpen,
    onTogglePrintMenu: actions.togglePrintMenu,
    onClose: () => onClose?.(),
    onDelete: actions.openDeleteConfirm,
    onDuplicate: () => void actions.duplicate(),
    onPrint: () => {
      actions.printDocumentPdf();
      actions.closePrintMenu();
    },
    onDownloadPdf: () => {
      actions.openDocumentPdf();
      actions.closePrintMenu();
    },
    onSaveMetadata: () => void actions.saveMetadata(),
    onReceiveAll: actions.receiveAll,
    onSaveDraft: () => void actions.saveDraft(),
    onAccept: () => void actions.accept(),
    assignPickerLineId,
    onCloseAssignPicker: () => setAssignPickerLineId(null),
    onPickAssignCarrier: (carrier) => {
      if (assignPickerLineId == null) return;
      setSuggestedCarrierBarcodeByLineId((prev) => ({
        ...prev,
        [assignPickerLineId]: (carrier.barcode || carrier.code || "").trim(),
      }));
      setAssignPickerLineId(null);
    },
    createCarrierLineId,
    onCloseCreateCarrier: () => setCreateCarrierLineId(null),
    onCreatedCarrier: (carrier) => {
      if (createCarrierLineId == null) return;
      setSuggestedCarrierBarcodeByLineId((prev) => ({
        ...prev,
        [createCarrierLineId]: (carrier.barcode || carrier.code || "").trim(),
      }));
      setCreateCarrierLineId(null);
    },
  };

  return {
    loading,
    error,
    detail,
    refresh: loadDetail,
    viewProps,
    actions,
    state,
    pickerModal: stockDocumentPickerModal,
  };
}
