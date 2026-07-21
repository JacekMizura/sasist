import type { RefObject } from "react";

import type { StockDocumentListRow, StockDocumentRead } from "../../../api/stockDocumentsApi";
import type { WarehouseCarrierRead } from "../../../api/wmsCarrierApi";
import ActivityLogPanel from "../../activityLog/ActivityLogPanel";
import DocumentPrintHistory from "../../printing/DocumentPrintHistory";
import { CarrierAssignProductsModal } from "../../warehouse/carriers/CarrierAssignProductsModal";
import { CarrierCreateModal } from "../../warehouse/carriers/CarrierCreateModal";
import { WarehouseDocumentDetailFooter } from "../../../pages/documents/WarehouseDocumentDetailFooter";
import { WarehouseDocumentDetailInfo } from "../../../pages/documents/WarehouseDocumentDetailInfo";
import { WarehouseDocumentLinesSection } from "../../../pages/documents/WarehouseDocumentLinesSection";
import type { WarehouseDocumentListConfig } from "../../../pages/documents/warehouseDocumentConfigs";
import type { WarehouseDocType } from "../../../pages/documents/warehouseDocumentConfigs";
import type { BusinessDocStatus } from "../../../pages/documents/warehouseDocumentsUi";

export type WarehouseStockDocumentLineSummary = {
  lineCount: number;
  sumOrdered: number;
  sumReceived: number;
  sumDiff: number;
  sumValueNet: number;
  sumValueGross: number;
  sumVat: number;
};

export type WarehouseStockDocumentDetailViewProps = {
  layout?: "modal" | "page";
  detailLoading: boolean;
  detailErr: string | null;
  detailId: number | null;
  detail: StockDocumentRead | null;
  detailDocType: WarehouseDocType;
  detailBizStatus: BusinessDocStatus | null;
  detailListConfig: WarehouseDocumentListConfig;
  isDraft: boolean;
  isPzDetail: boolean;
  isWzDetail: boolean;
  editMode: string;
  lineEditEnabled: boolean;
  canPostAccept: boolean;
  canEditMetadata: boolean;
  isWmsCompleteDraft: boolean;
  detailBusy: boolean;
  metaCurrency: string;
  metaNet: string;
  metaGross: string;
  onMetaCurrencyChange: (v: string) => void;
  onMetaNetChange: (v: string) => void;
  onMetaGrossChange: (v: string) => void;
  fmtMoneyCur: (n: number | null | undefined, currency: string | undefined) => string;
  listValueNetFormatted?: string;
  inputClass: string;
  receivedByLineId: Record<number, string>;
  suggestedCarrierBarcodeByLineId: Record<number, string>;
  onReceivedChange: (lineId: number, value: string) => void;
  onSuggestedCarrierChange: (lineId: number, value: string) => void;
  onAssignCarrier: (lineId: number) => void;
  onCreateCarrier: (lineId: number) => void;
  onClearCarrier: (lineId: number) => void;
  lineSummary: WarehouseStockDocumentLineSummary | null;
  tenantId: number;
  onSalesBlockUpdated: () => void;
  docLinesRef: RefObject<HTMLDivElement | null>;
  detailPrintMenuOpen: boolean;
  onTogglePrintMenu: () => void;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onPrint: () => void;
  onDownloadPdf: () => void;
  onSaveMetadata: () => void;
  onReceiveAll: () => void;
  onSaveDraft: () => void;
  onAccept: () => void;
  assignPickerLineId: number | null;
  onCloseAssignPicker: () => void;
  onPickAssignCarrier: (carrier: WarehouseCarrierRead) => void;
  createCarrierLineId: number | null;
  onCloseCreateCarrier: () => void;
  onCreatedCarrier: (carrier: WarehouseCarrierRead) => void;
};

export function WarehouseStockDocumentDetailView({
  layout = "modal",
  detailLoading,
  detailErr,
  detailId,
  detail,
  detailDocType,
  detailBizStatus,
  detailListConfig,
  isDraft,
  isPzDetail,
  isWzDetail,
  editMode,
  lineEditEnabled,
  canPostAccept,
  canEditMetadata,
  isWmsCompleteDraft,
  detailBusy,
  metaCurrency,
  metaNet,
  metaGross,
  onMetaCurrencyChange,
  onMetaNetChange,
  onMetaGrossChange,
  fmtMoneyCur,
  listValueNetFormatted,
  inputClass,
  receivedByLineId,
  suggestedCarrierBarcodeByLineId,
  onReceivedChange,
  onSuggestedCarrierChange,
  onAssignCarrier,
  onCreateCarrier,
  onClearCarrier,
  lineSummary,
  tenantId,
  onSalesBlockUpdated,
  docLinesRef,
  detailPrintMenuOpen,
  onTogglePrintMenu,
  onClose,
  onDelete,
  onDuplicate,
  onPrint,
  onDownloadPdf,
  onSaveMetadata,
  onReceiveAll,
  onSaveDraft,
  onAccept,
  assignPickerLineId,
  onCloseAssignPicker,
  onPickAssignCarrier,
  createCarrierLineId,
  onCloseCreateCarrier,
  onCreatedCarrier,
}: WarehouseStockDocumentDetailViewProps) {
  const rootClass =
    layout === "page"
      ? "flex min-h-0 flex-1 flex-col overflow-hidden"
      : "flex h-full min-h-0 flex-col overflow-hidden";

  return (
    <>
      <div className={rootClass}>
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
            onMetaCurrencyChange={onMetaCurrencyChange}
            onMetaNetChange={onMetaNetChange}
            onMetaGrossChange={onMetaGrossChange}
            fmtMoneyCur={fmtMoneyCur}
            listValueNetFormatted={
              listValueNetFormatted ??
              fmtMoneyCur(
                detail.total_net,
                detail.currency,
              )
            }
          />
        ) : (
          <header className="shrink-0 border-b border-slate-200 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Dokument magazynowy</p>
            <h2 className="text-xl font-semibold text-slate-900">{detailId != null ? `#${detailId}` : "—"}</h2>
          </header>
        )}

        {detailErr ? (
          <div className="shrink-0 border-b border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800">{detailErr}</div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {detailLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Wczytywanie…</div>
          ) : detail ? (
            <div ref={docLinesRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <WarehouseDocumentLinesSection
                className="min-h-0 flex-1"
                detail={detail}
                tenantId={tenantId}
                isWzDetail={isWzDetail}
                showPurchaseSalesBlock={isPzDetail}
                onSalesBlockUpdated={onSalesBlockUpdated}
                lineEditEnabled={lineEditEnabled}
                inputClass={inputClass}
                receivedByLineId={receivedByLineId}
                suggestedCarrierBarcodeByLineId={suggestedCarrierBarcodeByLineId}
                onReceivedChange={onReceivedChange}
                onSuggestedCarrierChange={onSuggestedCarrierChange}
                onAssignCarrier={onAssignCarrier}
                onCreateCarrier={onCreateCarrier}
                onClearCarrier={onClearCarrier}
                lineSummary={lineSummary}
              />
            </div>
          ) : null}
        </div>

        {detail && detailId != null ? (
          <div className="shrink-0 space-y-3 border-t border-slate-200 p-4">
            {isPzDetail ? (
              <ActivityLogPanel objectType="document" objectId={detailId} title="Historia czynności" />
            ) : null}
            <DocumentPrintHistory
              tenantId={tenantId}
              documentType="stock_document"
              documentId={detailId}
              warehouseId={detail.warehouse_id ?? undefined}
            />
          </div>
        ) : null}

        <WarehouseDocumentDetailFooter
          detailBusy={detailBusy}
          detailId={detailId}
          detail={detail}
          detailPrintMenuOpen={detailPrintMenuOpen}
          onTogglePrintMenu={onTogglePrintMenu}
          onClose={onClose}
          onScrollToLines={() => docLinesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onPrint={onPrint}
          onDownloadPdf={onDownloadPdf}
          canEditMetadata={canEditMetadata}
          onSaveMetadata={onSaveMetadata}
          isDraft={isDraft}
          isWmsCompleteDraft={isWmsCompleteDraft}
          isPzDetail={isPzDetail}
          lineEditEnabled={lineEditEnabled}
          canPostAccept={canPostAccept}
          onReceiveAll={onReceiveAll}
          onSaveDraft={onSaveDraft}
          onAccept={onAccept}
        />
      </div>

      <CarrierAssignProductsModal
        tenantId={tenantId}
        open={assignPickerLineId != null}
        onClose={onCloseAssignPicker}
        onPick={onPickAssignCarrier}
      />
      <CarrierCreateModal
        tenantId={tenantId}
        open={createCarrierLineId != null}
        onClose={onCloseCreateCarrier}
        onCreated={onCreatedCarrier}
      />
    </>
  );
}

export function warehouseDetailListValueNetFormatted(
  detail: StockDocumentRead,
  detailDocType: WarehouseDocType,
  fmtMoneyCur: (n: number | null | undefined, currency: string | undefined) => string,
  listValueNet: (row: StockDocumentListRow, docType: WarehouseDocType) => number | null,
): string {
  return fmtMoneyCur(
    listValueNet(
      {
        total_net: detail.total_net,
        total_gross: detail.total_gross,
        currency: detail.currency,
      } as StockDocumentListRow,
      detailDocType,
    ),
    detail.currency,
  );
}
