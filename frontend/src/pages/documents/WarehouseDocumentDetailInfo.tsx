import { Link } from "react-router-dom";
import type { StockDocumentRead } from "../../api/stockDocumentsApi";
import { ExternalStatusBadge } from "./documentsBadges";
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
  warehouseDocFinancialInputClass,
  WarehouseDocFinancialItem,
} from "./warehouseDocumentDetailUi";

function formatDateShort(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pl-PL", { dateStyle: "short" });
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

function kontrahentValue(detailDocType: WarehouseDocType, detail: StockDocumentRead): React.ReactNode {
  if (shouldShowSupplierCard(detailDocType, detail)) {
    const name = (detail.supplier_name || "").trim();
    return name || (detail.supplier_id != null ? `#${detail.supplier_id}` : "—");
  }
  if (shouldShowCustomerCard(detailDocType)) {
    return (detail.customer_name || "").trim() || "—";
  }
  return "—";
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

function HeaderMetaCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 truncate text-[12px] leading-tight">
      <span className="text-slate-500">{label} </span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

export function WarehouseDocumentDetailInfo({
  detail,
  detailDocType,
  detailBizStatus,
  detailListConfig,
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
  const docNumber = `${docTypeLabel} ${(detail.document_number || "").trim() || detail.id}`.trim();
  const showFinancial = detailListConfig.financialDetail !== "none";
  const warehouseLabel = detailDocType === "MM" ? "Z magazynu" : "Magazyn";
  const locationLabel = detailDocType === "MM" ? "Do magazynu" : "Lokalizacja";
  const kontrahentLabel =
    shouldShowSupplierCard(detailDocType, detail) || shouldShowCustomerCard(detailDocType)
      ? "Kontrahent"
      : "Źródło";

  const kontrahent =
    shouldShowSupplierCard(detailDocType, detail) || shouldShowCustomerCard(detailDocType)
      ? kontrahentValue(detailDocType, detail)
      : documentSourceLabelDetail(detail);

  return (
    <header className="max-h-[140px] shrink-0 overflow-hidden border-b border-slate-200 bg-white px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold tracking-tight text-slate-900">{docNumber}</h2>
            {detailBizStatus ? <ExternalStatusBadge status={detailBizStatus} /> : null}
          </div>
          <div className="mt-1 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
            <HeaderMetaCell label={`${warehouseLabel}:`} value={magazynValue(detailDocType, detail)} />
            <HeaderMetaCell label={`${kontrahentLabel}:`} value={kontrahent} />
            <HeaderMetaCell
              label="Data:"
              value={<span className="tabular-nums">{formatDateShort(detail.created_at)}</span>}
            />
            <HeaderMetaCell label={`${locationLabel}:`} value={lokalizacjaValue(detailDocType, detail)} />
          </div>
          {detailDocType === "PW" ? (
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              Rozlokowanie: {putawayStatusLabel(detail.putaway_status)} · Seria: {seriesCode(detail)}
            </p>
          ) : null}
        </div>

        {showFinancial ? (
          <div className="shrink-0 text-right text-[11px] leading-snug">
            {canEditMetadata ? (
              <div className="flex flex-col items-end gap-1">
                <label className="inline-flex items-center gap-1.5">
                  <span className="text-slate-500">Waluta</span>
                  <input
                    value={metaCurrency}
                    onChange={(e) => onMetaCurrencyChange(e.target.value.toUpperCase())}
                    maxLength={8}
                    className={`${warehouseDocFinancialInputClass} !h-7 !w-16 !py-0 uppercase`}
                  />
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <span className="text-slate-500">Netto</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={metaNet}
                    onChange={(e) => onMetaNetChange(e.target.value)}
                    className={`${warehouseDocFinancialInputClass} !h-7 !w-24 text-right`}
                  />
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <span className="text-slate-500">Brutto</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={metaGross}
                    onChange={(e) => onMetaGrossChange(e.target.value)}
                    className={`${warehouseDocFinancialInputClass} !h-7 !w-24 text-right`}
                  />
                </label>
                <span className="text-slate-600">
                  VAT{" "}
                  <span className="font-semibold tabular-nums text-slate-900">
                    {fmtMoneyCur(detail.total_vat, detail.currency)}
                  </span>
                </span>
              </div>
            ) : detailListConfig.financialDetail === "netOnly" ? (
              <div className="space-y-0.5">
                <div className="text-slate-500">Netto</div>
                <div className="text-sm font-semibold tabular-nums text-slate-900">
                  {listValueNetFormatted ?? fmtMoneyCur(detail.total_net, detail.currency)}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-end gap-0.5 tabular-nums">
                <WarehouseDocFinancialItem compact label="Netto" value={fmtMoneyCur(detail.total_net, detail.currency)} />
                <WarehouseDocFinancialItem compact label="VAT" value={fmtMoneyCur(detail.total_vat, detail.currency)} />
                <WarehouseDocFinancialItem compact label="Brutto" value={fmtMoneyCur(detail.total_gross, detail.currency)} />
              </div>
            )}
          </div>
        ) : null}
      </div>
    </header>
  );
}
