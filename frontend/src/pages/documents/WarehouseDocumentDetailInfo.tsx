import { Link } from "react-router-dom";
import type { StockDocumentRead } from "../../api/stockDocumentsApi";
import { documentCreatedByLabel } from "../../utils/documentCreatedBy";
import { DocumentTypeBadge, ExternalStatusBadge } from "./documentsBadges";
import type { WarehouseDocumentListConfig } from "./warehouseDocumentConfigs";
import type { WarehouseDocType } from "./warehouseDocumentConfigs";
import {
  documentSourceLabelDetail,
  mmFromLabel,
  mmToLabel,
  putawayStatusLabel,
  seriesCode,
  shouldShowCustomerCard,
  shouldShowSupplierCard,
} from "./warehouseDocumentHelpers";
import type { BusinessDocStatus } from "./warehouseDocumentsUi";
import { normalizeWarehouseDocType } from "./warehouseDocumentsUi";
import {
  WarehouseDocCompactRow,
  WarehouseDocFinancialCompactBar,
  warehouseDocFinancialInputClass,
  WarehouseDocFinancialItem,
  WarehouseDocFinancialSeparator,
  warehouseDocInfoCardClass,
} from "./warehouseDocumentDetailUi";

function formatDt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

type Props = {
  detail: StockDocumentRead;
  detailDocType: WarehouseDocType;
  detailBizStatus: BusinessDocStatus | null;
  detailListConfig: WarehouseDocumentListConfig;
  isDraft: boolean;
  isPzDetail: boolean;
  editMode: string;
  canEditMetadata: boolean;
  metaCurrency: string;
  metaNet: string;
  metaGross: string;
  onMetaCurrencyChange: (v: string) => void;
  onMetaNetChange: (v: string) => void;
  onMetaGrossChange: (v: string) => void;
  fmtMoneyCur: (n: number | null | undefined, currency: string | undefined) => string;
  listValueNetFormatted?: string;
};

function statusHintText(isDraft: boolean, isPzDetail: boolean, editMode: string): string | null {
  if (isDraft && isPzDetail && editMode === "full") {
    return "Szkic — edycja ilości i pól finansowych. Po zatwierdzeniu aktualizują się stany magazynowe.";
  }
  if (isDraft && isPzDetail && editMode === "metadata") {
    return "W trakcie — edycja tylko pól finansowych (bez wpływu na operacje magazynowe).";
  }
  if (isDraft && !isPzDetail) {
    return "Podgląd szkicu — pełna obsługa operacyjna dla innych typów w kolejnych wersjach.";
  }
  if (isDraft) return null;
  return "Dokument zaksięgowany lub anulowany — podgląd tylko do odczytu.";
}

function kontrahentValue(
  detailDocType: WarehouseDocType,
  detail: StockDocumentRead,
): React.ReactNode {
  if (shouldShowSupplierCard(detailDocType, detail)) {
    const name = (detail.supplier_name || "").trim();
    return name || (detail.supplier_id != null ? `#${detail.supplier_id}` : "—");
  }
  if (shouldShowCustomerCard(detailDocType)) {
    return (detail.customer_name || "").trim() || "—";
  }
  return "—";
}

function dostawaValue(detail: StockDocumentRead): React.ReactNode {
  if (detail.linked_sale_document) {
    return (
      <Link
        to={detail.linked_sale_document.detail_path}
        className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
      >
        {detail.linked_sale_document.document_number || detail.linked_sale_document.id}
      </Link>
    );
  }
  if (detail.delivery_id != null) {
    return (
      <Link
        to={`/goods-orders/${detail.delivery_id}`}
        className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
      >
        #{detail.delivery_id}
      </Link>
    );
  }
  if (detail.order_id != null) {
    return (
      <Link
        to={`/orders/${detail.order_id}`}
        className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
      >
        Zam. #{(detail.order_number || "").trim() || detail.order_id}
      </Link>
    );
  }
  if (detail.production_order_id != null) {
    return (
      <Link
        to={detail.production_order_path ?? "/production"}
        className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
      >
        {(detail.production_order_number || "").trim() || `MO #${detail.production_order_id}`}
      </Link>
    );
  }
  return documentSourceLabelDetail(detail);
}

function magazynValue(detailDocType: WarehouseDocType, detail: StockDocumentRead): React.ReactNode {
  if (detailDocType === "MM") return mmFromLabel(detail);
  if (detail.warehouse_id == null) {
    return <span className="text-amber-800">— (WMS → Przyjęcie)</span>;
  }
  return (detail.warehouse_name || "").trim() || `#${detail.warehouse_id}`;
}

function lokalizacjaValue(detailDocType: WarehouseDocType, detail: StockDocumentRead): React.ReactNode {
  if (detailDocType === "MM") return mmToLabel(detail);
  if (detailDocType === "PW") {
    return (detail.location_name || "").trim() || (detail.location_id != null ? `#${detail.location_id}` : "—");
  }
  if (detail.location_id == null) {
    return <span className="text-amber-800">— (WMS → Przyjęcie)</span>;
  }
  return (detail.location_name || "").trim() || `#${detail.location_id}`;
}

export function WarehouseDocumentDetailInfo({
  detail,
  detailDocType,
  detailBizStatus,
  detailListConfig,
  isDraft,
  isPzDetail,
  editMode,
  canEditMetadata,
  metaCurrency,
  metaNet,
  metaGross,
  onMetaCurrencyChange,
  onMetaNetChange,
  onMetaGrossChange,
  fmtMoneyCur,
  listValueNetFormatted,
}: Props) {
  const docTypeLabel = normalizeWarehouseDocType(detail.document_type);
  const docNumber =
    `${docTypeLabel} ${(detail.document_number || "").trim() || detail.id}`.trim();
  const hint = statusHintText(isDraft, isPzDetail, editMode);
  const showFinancial = detailListConfig.financialDetail !== "none";

  return (
    <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Dokument magazynowy · {docTypeLabel}
          </p>
          <h2 className="truncate text-xl font-semibold tracking-tight text-slate-900">{docNumber}</h2>
          {hint ? <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-500">{hint}</p> : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className={warehouseDocInfoCardClass}>
          <WarehouseDocCompactRow label="Numer dokumentu" value={docNumber} />
          <WarehouseDocCompactRow
            label="Status"
            value={detailBizStatus ? <ExternalStatusBadge status={detailBizStatus} /> : "—"}
          />
          <WarehouseDocCompactRow
            label={detailDocType === "MM" ? "Z magazynu" : "Magazyn"}
            value={magazynValue(detailDocType, detail)}
          />
          <WarehouseDocCompactRow label="Kontrahent" value={kontrahentValue(detailDocType, detail)} />
          <WarehouseDocCompactRow label="Dostawa" value={dostawaValue(detail)} />
        </div>

        <div className={warehouseDocInfoCardClass}>
          <WarehouseDocCompactRow label="Typ" value={<DocumentTypeBadge code={detail.document_type} />} />
          <WarehouseDocCompactRow
            label="Data"
            value={<span className="tabular-nums">{formatDt(detail.created_at)}</span>}
          />
          <WarehouseDocCompactRow label="Autor" value={documentCreatedByLabel(detail.created_by)} />
          <WarehouseDocCompactRow
            label={detailDocType === "MM" ? "Do magazynu" : "Lokalizacja"}
            value={lokalizacjaValue(detailDocType, detail)}
          />
          <WarehouseDocCompactRow label="Seria" value={seriesCode(detail)} />
          {detailDocType === "PW" ? (
            <WarehouseDocCompactRow label="Rozlokowanie" value={putawayStatusLabel(detail.putaway_status)} />
          ) : null}
        </div>
      </div>

      {showFinancial ? (
        <WarehouseDocFinancialCompactBar>
          {canEditMetadata ? (
            <>
              <label className="inline-flex items-center gap-2">
                <span className="text-xs text-slate-500">Waluta</span>
                <input
                  value={metaCurrency}
                  onChange={(e) => onMetaCurrencyChange(e.target.value.toUpperCase())}
                  maxLength={8}
                  className={`${warehouseDocFinancialInputClass} !w-20 uppercase`}
                />
              </label>
              <WarehouseDocFinancialSeparator />
              <label className="inline-flex items-center gap-2">
                <span className="text-xs text-slate-500">Netto</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={metaNet}
                  onChange={(e) => onMetaNetChange(e.target.value)}
                  className={`${warehouseDocFinancialInputClass} !w-28 text-right`}
                />
              </label>
              <WarehouseDocFinancialSeparator />
              <label className="inline-flex items-center gap-2">
                <span className="text-xs text-slate-500">Brutto</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={metaGross}
                  onChange={(e) => onMetaGrossChange(e.target.value)}
                  className={`${warehouseDocFinancialInputClass} !w-28 text-right`}
                />
              </label>
              <WarehouseDocFinancialSeparator />
              <WarehouseDocFinancialItem
                label="VAT"
                value={fmtMoneyCur(detail.total_vat, detail.currency)}
              />
            </>
          ) : detailListConfig.financialDetail === "netOnly" ? (
            <WarehouseDocFinancialItem
              label="Wartość netto"
              value={listValueNetFormatted ?? fmtMoneyCur(detail.total_net, detail.currency)}
            />
          ) : (
            <>
              <WarehouseDocFinancialItem
                label="Netto"
                value={fmtMoneyCur(detail.total_net, detail.currency)}
              />
              <WarehouseDocFinancialSeparator />
              <WarehouseDocFinancialItem label="VAT" value={fmtMoneyCur(detail.total_vat, detail.currency)} />
              <WarehouseDocFinancialSeparator />
              <WarehouseDocFinancialItem
                label="Brutto"
                value={fmtMoneyCur(detail.total_gross, detail.currency)}
              />
            </>
          )}
        </WarehouseDocFinancialCompactBar>
      ) : null}
    </header>
  );
}
