import type { StockDocumentRead } from "../../../api/stockDocumentsApi";
import { formatMoneyPl } from "../../../utils/formatOrderMoney";
import { getWarehouseDocumentConfig } from "../warehouseDocumentConfigs";
import type { WarehouseDocType } from "../warehouseDocumentConfigs";
import {
  logReceivingStatusDebug,
  normalizeWarehouseDocType,
  warehouseDocumentListStatus,
  type BusinessDocStatus,
  type WarehouseDocumentType,
} from "../warehouseDocumentsUi";
import type { WarehouseStockDocumentLineSummary } from "../../../components/documents/warehouse/WarehouseStockDocumentDetailView";

export const WAREHOUSE_STOCK_DOC_INPUT_CLASS =
  "w-full min-w-[4.5rem] rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums text-slate-800 focus:border-violet-400 focus:ring-2 focus:ring-violet-500";

export function parseQty(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function fmtMoneyCur(n: number | null | undefined, currency: string | undefined) {
  const c = (currency || "PLN").trim() || "PLN";
  if (n == null || !Number.isFinite(n)) return "—";
  if (c === "PLN" || c === "zł") return formatMoneyPl(n);
  return formatMoneyPl(n, { currency: c });
}

export type WarehouseStockDocumentDerived = {
  isDraft: boolean;
  isWmsCompleteDraft: boolean;
  isPzDetail: boolean;
  isWzDetail: boolean;
  detailDocType: WarehouseDocType;
  editMode: string;
  lineEditEnabled: boolean;
  canPostAccept: boolean;
  canEditMetadata: boolean;
};

export function computeDetailDerived(
  detail: StockDocumentRead | null,
  docTypeFallback: WarehouseDocumentType,
): WarehouseStockDocumentDerived {
  const docStatusLower = (detail?.status || "").toLowerCase();
  const isDraft = docStatusLower === "draft";
  const isWmsCompleteDraft = docStatusLower === "zakonczone";
  const isPzDetail = detail ? normalizeWarehouseDocType(detail.document_type) === "PZ" : false;
  const isWzDetail = detail ? normalizeWarehouseDocType(detail.document_type) === "WZ" : false;
  const detailDocType = detail ? normalizeWarehouseDocType(detail.document_type) : docTypeFallback;
  const editMode = detail?.edit_mode ?? "none";
  const lineEditEnabled = Boolean(isDraft && isPzDetail && editMode === "full");
  const canPostAccept =
    detail != null && detail.warehouse_id != null && detail.warehouse_id > 0 && (isDraft || isWmsCompleteDraft);
  const canEditMetadata = isDraft && (editMode === "full" || editMode === "metadata");
  return {
    isDraft,
    isWmsCompleteDraft,
    isPzDetail,
    isWzDetail,
    detailDocType,
    editMode,
    lineEditEnabled,
    canPostAccept,
    canEditMetadata,
  };
}

export function computeDetailBizStatus(
  detail: StockDocumentRead | null,
  canPostAccept: boolean,
): BusinessDocStatus | null {
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
}

export function computeLineSummary(
  detail: StockDocumentRead | null,
  receivedByLineId: Record<number, string>,
  isWzDetail: boolean,
): WarehouseStockDocumentLineSummary | null {
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
    const qtyForVal = isWzDetail ? Number(it.quantity) || Number(it.ordered_quantity) || 0 : rec;
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
}

export function getDetailListConfig(detailDocType: WarehouseDocType) {
  return getWarehouseDocumentConfig(detailDocType);
}
