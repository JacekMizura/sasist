import { useEffect, useState } from "react";
import type { StockDocumentItemRead, StockDocumentRead } from "../../api/stockDocumentsApi";
import { PurchaseSalesBlockDrawer } from "../../components/purchasing/PurchaseSalesBlockDrawer";
import { CarrierBadge } from "../../components/warehouse/carriers/CarrierBadge";
import { formatMoneyPl } from "../../utils/formatOrderMoney";
import { wmsReceiptLineImageUrl } from "../../utils/wmsReceiptLineMedia";
import {
  WarehouseDocumentLineActionsMenu,
  type LineActionKind,
} from "./WarehouseDocumentLineActionsMenu";
import { WarehouseDocumentLineDetailDrawer } from "./WarehouseDocumentLineDetailDrawer";
import {
  WarehouseDocSummaryBar,
  WarehouseDocSummaryItem,
  WarehouseDocSummarySeparator,
  warehouseDocDetailScrollClass,
} from "./warehouseDocumentDetailUi";
import {
  DeliveryDifferenceAcceptedBadge,
  deliveryShortageQty,
  hasDeliveryQuantityDiff,
  receiptLineDisplayName,
  receiptLineStatusLabel,
  WarehouseLineLocationCell,
  WarehouseLineProductThumb,
  WarehouseLineStatusBadge,
  wzLineStatusLabel,
} from "./warehouseDocumentLineUi";
import { WarehouseDocumentOverlayPortal } from "./WarehouseDocumentOverlayPortal";

export type WarehouseLineSummary = {
  lineCount: number;
  sumOrdered: number;
  sumReceived: number;
  sumDiff: number;
  sumValueNet: number;
  sumValueGross: number;
  sumVat: number;
};

function fmtQty(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 6 }).format(n);
}

function fmtMoney(n: number) {
  return formatMoneyPl(n);
}

function diffToneClass(diff: number) {
  if (Math.abs(diff) < 1e-9) return "text-slate-500";
  if (diff < 0) return "text-red-600";
  return "text-emerald-600";
}

function fmtVatRate(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  const pct = rate <= 1 && rate > 0 ? rate * 100 : rate;
  return `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(pct)}%`;
}

type Props = {
  detail: StockDocumentRead;
  tenantId: number;
  isWzDetail: boolean;
  showPurchaseSalesBlock?: boolean;
  onSalesBlockUpdated?: () => void;
  lineEditEnabled: boolean;
  inputClass: string;
  receivedByLineId: Record<number, string>;
  suggestedCarrierBarcodeByLineId: Record<number, string>;
  onReceivedChange: (lineId: number, value: string) => void;
  onSuggestedCarrierChange: (lineId: number, value: string) => void;
  onAssignCarrier: (lineId: number) => void;
  onCreateCarrier: (lineId: number) => void;
  onClearCarrier: (lineId: number) => void;
  lineSummary: WarehouseLineSummary | null;
  className?: string;
};

export function WarehouseDocumentLinesSection({
  detail,
  tenantId,
  isWzDetail,
  showPurchaseSalesBlock = false,
  onSalesBlockUpdated,
  lineEditEnabled,
  inputClass,
  receivedByLineId,
  suggestedCarrierBarcodeByLineId,
  onReceivedChange,
  onSuggestedCarrierChange,
  onAssignCarrier,
  onCreateCarrier,
  onClearCarrier,
  lineSummary,
  className = "",
}: Props) {
  const thCls =
    "px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500";
  const thRightCls = `${thCls} text-right`;
  const tdCls = "px-1.5 py-1 align-middle";
  const rowCls = "h-11 max-h-12 transition-colors hover:bg-slate-50/40";

  type DrawerState =
    | { kind: "sales_block"; line: StockDocumentItemRead; index: number }
    | { kind: "block_history"; line: StockDocumentItemRead; index: number }
    | { kind: "line_detail"; line: StockDocumentItemRead; index: number }
    | null;

  type ConfirmDiffState = {
    line: StockDocumentItemRead;
    index: number;
    ordered: number;
    received: number;
  };

  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [confirmDiff, setConfirmDiff] = useState<ConfirmDiffState | null>(null);
  const [acceptedDiffLineIds, setAcceptedDiffLineIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    setAcceptedDiffLineIds(new Set());
    setConfirmDiff(null);
  }, [detail.id]);

  function openLineAction(
    index: number,
    line: StockDocumentItemRead,
    kind: LineActionKind,
    received: number,
  ) {
    if (kind === "accept_delivery_diff") {
      setConfirmDiff({
        line,
        index,
        ordered: line.ordered_quantity,
        received,
      });
      return;
    }
    if (kind === "sales_block") {
      setDrawer({ kind: "sales_block", line, index });
      return;
    }
    if (kind === "block_history") {
      setDrawer({ kind: "block_history", line, index });
      return;
    }
    setDrawer({ kind: "line_detail", line, index });
  }

  function confirmDeliveryDiffAcceptance() {
    if (!confirmDiff) return;
    setAcceptedDiffLineIds((prev) => {
      const next = new Set(prev);
      next.add(confirmDiff.line.id);
      return next;
    });
    setConfirmDiff(null);
  }

  const actionCol = showPurchaseSalesBlock && !isWzDetail;

  return (
    <section
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-white ${className}`.trim()}
    >
      {detail.items.length === 0 ? (
        <p className="px-3 py-6 text-sm text-slate-600">Brak pozycji na dokumencie.</p>
      ) : (
        <>
          <div className={warehouseDocDetailScrollClass}>
            <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[1180px] text-[13px]">
              <thead className="sticky top-0 z-[1] bg-white shadow-[0_1px_0_0_rgb(241_245_249)]">
                <tr className="border-b border-slate-100">
                  <th className={`${thCls} w-10 text-center`}>#</th>
                  <th className={`${thCls} pl-2`}>Nazwa</th>
                  <th className={thRightCls}>{isWzDetail ? "Ilość" : "Ilość z dokumentu"}</th>
                  {!isWzDetail ? <th className={thRightCls}>Ilość rzeczywista</th> : null}
                  {lineEditEnabled ? (
                    <th className={thCls}>
                      Nośnik <span className="font-normal normal-case text-slate-400">(sugestia)</span>
                    </th>
                  ) : null}
                  <th className={thCls}>Lokalizacja</th>
                  <th className={thCls}>Status</th>
                  {!isWzDetail ? <th className={thRightCls}>Różnica</th> : null}
                  <th className={thRightCls}>Jedn.</th>
                  <th className={thRightCls}>VAT</th>
                  <th className={thRightCls}>Cena netto</th>
                  <th className={thRightCls}>Wartość netto</th>
                  <th className={thRightCls}>Cena brutto</th>
                  <th className={thRightCls}>Wartość brutto</th>
                  {actionCol ? <th className={`${thCls} w-12 text-center`}>Akcje</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.items.map((it, index) => (
                  <LineRow
                    key={it.id}
                    index={index}
                    it={it}
                    rowCls={rowCls}
                    isWzDetail={isWzDetail}
                    lineEditEnabled={lineEditEnabled}
                    inputClass={inputClass}
                    receivedRaw={receivedByLineId[it.id]}
                    suggestedCarrier={suggestedCarrierBarcodeByLineId[it.id]}
                    onReceivedChange={onReceivedChange}
                    onSuggestedCarrierChange={onSuggestedCarrierChange}
                    onAssignCarrier={onAssignCarrier}
                    onCreateCarrier={onCreateCarrier}
                    onClearCarrier={onClearCarrier}
                    showActions={actionCol}
                    deliveryDiffAccepted={acceptedDiffLineIds.has(it.id)}
                    onLineAction={(kind, received) => openLineAction(index, it, kind, received)}
                    tdCls={tdCls}
                    dockLocationCode={(detail.location_name || "").trim() || "DOCK-IN"}
                  />
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <PurchaseSalesBlockDrawer
            open={drawer?.kind === "sales_block"}
            tenantId={tenantId}
            documentId={detail.id}
            line={drawer?.kind === "sales_block" ? drawer.line : null}
            lineIndex={drawer?.kind === "sales_block" ? drawer.index : 0}
            onClose={() => setDrawer(null)}
            onUpdated={() => onSalesBlockUpdated?.()}
          />
          <WarehouseDocumentLineDetailDrawer
            open={drawer?.kind === "block_history" || drawer?.kind === "line_detail"}
            mode={drawer?.kind === "block_history" ? "block_history" : "detail"}
            line={
              drawer?.kind === "block_history" || drawer?.kind === "line_detail" ? drawer.line : null
            }
            lineIndex={
              drawer?.kind === "block_history" || drawer?.kind === "line_detail" ? drawer.index : 0
            }
            deliveryDiffAccepted={
              drawer?.kind === "line_detail" ? acceptedDiffLineIds.has(drawer.line.id) : false
            }
            dockLocationCode={(detail.location_name || "").trim() || "DOCK-IN"}
            onClose={() => setDrawer(null)}
          />

          <DeliveryDiffConfirmDialog
            open={confirmDiff != null}
            ordered={confirmDiff?.ordered ?? 0}
            received={confirmDiff?.received ?? 0}
            lineLabel={
              confirmDiff
                ? `#${confirmDiff.index + 1} · ${receiptLineDisplayName(confirmDiff.line)}`
                : ""
            }
            onCancel={() => setConfirmDiff(null)}
            onConfirm={confirmDeliveryDiffAcceptance}
          />

          {lineSummary ? (
            <WarehouseDocumentSummaryPanel isWzDetail={isWzDetail} lineSummary={lineSummary} />
          ) : null}
        </>
      )}
    </section>
  );
}

function LineRow({
  index,
  it,
  isWzDetail,
  lineEditEnabled,
  inputClass,
  receivedRaw,
  suggestedCarrier,
  onReceivedChange,
  onSuggestedCarrierChange,
  onAssignCarrier,
  onCreateCarrier,
  onClearCarrier,
  showActions,
  deliveryDiffAccepted,
  onLineAction,
  tdCls,
  rowCls,
  dockLocationCode,
}: {
  index: number;
  it: StockDocumentItemRead;
  isWzDetail: boolean;
  lineEditEnabled: boolean;
  inputClass: string;
  receivedRaw?: string;
  suggestedCarrier?: string;
  onReceivedChange: (lineId: number, value: string) => void;
  onSuggestedCarrierChange: (lineId: number, value: string) => void;
  onAssignCarrier: (lineId: number) => void;
  onCreateCarrier: (lineId: number) => void;
  onClearCarrier: (lineId: number) => void;
  showActions: boolean;
  deliveryDiffAccepted: boolean;
  onLineAction: (kind: LineActionKind, received: number) => void;
  tdCls: string;
  rowCls: string;
  /** Receiving dock code from parent StockDocumentRead.location_name (DOCK-IN remainder). */
  dockLocationCode: string;
}) {
  const parseQty = (s: string | undefined): number | null => {
    const t = (s ?? "").trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const recParsed = parseQty(receivedRaw);
  const rec = recParsed ?? it.received_quantity;
  const qty = isWzDetail ? Number(it.quantity) || Number(it.ordered_quantity) || 0 : it.ordered_quantity;
  const diff = rec - it.ordered_quantity;
  const price = it.purchase_price_net;
  const qtyForVal = isWzDetail ? qty : rec;
  const valNet =
    it.value_net ??
    (price != null && Number.isFinite(qtyForVal) ? qtyForVal * price : null);
  const priceGross = it.unit_price_gross ?? null;
  const valGross =
    it.value_gross ??
    (priceGross != null && Number.isFinite(qtyForVal) ? qtyForVal * priceGross : null);
  const ean = (it.product_ean || "").trim();
  const sku = (it.product_sku || "").trim();
  const statusLabel = isWzDetail ? wzLineStatusLabel(it) : receiptLineStatusLabel(it);
  const effectiveBlock = Number(it.sales_block_effective_qty ?? it.sales_blocked_qty ?? 0);
  const hasActiveBlock = effectiveBlock > 0;
  const canAddSalesBlock = it.product_id != null && rec > 1e-6;
  const hasQtyDiff = hasDeliveryQuantityDiff(it.ordered_quantity, rec);
  const canAcceptDeliveryDiff = hasQtyDiff && !deliveryDiffAccepted;

  return (
    <tr className={rowCls}>
      <td className={`${tdCls} text-center tabular-nums text-[11px] font-semibold text-slate-500`}>
        {index + 1}
      </td>
      <td className={`${tdCls} pl-1.5`}>
        <div className="flex items-center gap-2">
          <WarehouseLineProductThumb url={wmsReceiptLineImageUrl(it)} compact />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium leading-tight text-slate-900">
              {receiptLineDisplayName(it)}
            </div>
            <div className="truncate text-[10px] leading-tight text-slate-500">
              {ean ? `EAN ${ean}` : "EAN —"}
              {sku ? ` · SKU ${sku}` : " · SKU —"}
            </div>
          </div>
        </div>
      </td>
      <td className={`${tdCls} text-right tabular-nums font-medium text-slate-800`}>{fmtQty(qty)}</td>
      {!isWzDetail ? (
        <td className={`${tdCls} text-right tabular-nums`}>
          {lineEditEnabled ? (
            <input
              type="text"
              inputMode="decimal"
              className={`${inputClass} inline-block w-[5rem] !py-1 text-[13px]`}
              value={receivedRaw ?? ""}
              onChange={(e) => onReceivedChange(it.id, e.target.value)}
              aria-label={`Przyjęto dla pozycji ${index + 1}`}
            />
          ) : (
            <span className="font-medium text-slate-900">{fmtQty(it.received_quantity)}</span>
          )}
        </td>
      ) : null}
      {lineEditEnabled ? (
        <td className={tdCls}>
          <CarrierSuggestionCell
            lineId={it.id}
            suggestedCarrier={suggestedCarrier}
            inputClass={inputClass}
            onSuggestedCarrierChange={onSuggestedCarrierChange}
            onAssignCarrier={onAssignCarrier}
            onCreateCarrier={onCreateCarrier}
            onClearCarrier={onClearCarrier}
          />
        </td>
      ) : null}
      <td className={tdCls}>
        <WarehouseLineLocationCell
          it={it}
          isWz={isWzDetail}
          dockLocationCode={dockLocationCode}
        />
      </td>
      <td className={tdCls}>
        <div className="flex flex-wrap items-center gap-1.5">
          <WarehouseLineStatusBadge label={statusLabel} />
          {deliveryDiffAccepted ? <DeliveryDifferenceAcceptedBadge received={rec} /> : null}
        </div>
      </td>
      {!isWzDetail ? (
        <td className={`${tdCls} text-right tabular-nums text-sm font-semibold ${diffToneClass(diff)}`}>
          {fmtQty(diff)}
        </td>
      ) : null}
      <td className={`${tdCls} text-right text-xs text-slate-600`}>
        {(it.line_unit || "").trim() || "—"}
      </td>
      <td className={`${tdCls} text-right tabular-nums text-xs text-slate-600`}>
        {fmtVatRate(it.vat_rate)}
      </td>
      <td className={`${tdCls} text-right tabular-nums text-xs text-slate-700`}>
        {price != null ? fmtMoney(price) : "—"}
      </td>
      <td className={`${tdCls} text-right tabular-nums text-sm font-medium text-slate-900`}>
        {valNet != null ? fmtMoney(valNet) : "—"}
      </td>
      <td className={`${tdCls} text-right tabular-nums text-xs text-slate-700`}>
        {priceGross != null ? fmtMoney(priceGross) : "—"}
      </td>
      <td className={`${tdCls} text-right tabular-nums text-sm font-medium text-slate-900`}>
        {valGross != null ? fmtMoney(valGross) : "—"}
      </td>
      {showActions ? (
        <td className={`${tdCls} text-center`}>
          <WarehouseDocumentLineActionsMenu
            lineId={it.id}
            hasProduct={it.product_id != null}
            hasActiveBlock={hasActiveBlock}
            canAddSalesBlock={canAddSalesBlock}
            canAcceptDeliveryDiff={canAcceptDeliveryDiff}
            onAction={(kind) => onLineAction(kind, rec)}
          />
        </td>
      ) : null}
    </tr>
  );
}

function CarrierSuggestionCell({
  lineId,
  suggestedCarrier,
  inputClass,
  onSuggestedCarrierChange,
  onAssignCarrier,
  onCreateCarrier,
  onClearCarrier,
}: {
  lineId: number;
  suggestedCarrier?: string;
  inputClass: string;
  onSuggestedCarrierChange: (lineId: number, value: string) => void;
  onAssignCarrier: (lineId: number) => void;
  onCreateCarrier: (lineId: number) => void;
  onClearCarrier: (lineId: number) => void;
}) {
  const bc = (suggestedCarrier ?? "").trim();
  return (
    <div className="flex min-w-[10rem] flex-col gap-2">
      {bc ? (
        <CarrierBadge code={bc} />
      ) : (
        <span className="text-[11px] font-medium text-slate-400">Brak nośnika</span>
      )}
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onAssignCarrier(lineId)}
          className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase text-amber-950 hover:bg-amber-100"
        >
          Wybierz
        </button>
        <button
          type="button"
          onClick={() => onCreateCarrier(lineId)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase text-slate-700 hover:bg-slate-50"
        >
          + Nowy
        </button>
        <button
          type="button"
          onClick={() => onClearCarrier(lineId)}
          className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-50"
        >
          Wyczyść
        </button>
      </div>
      <input
        type="text"
        className={`${inputClass} w-full font-mono text-[11px]`}
        placeholder="Ręcznie: PAL-…"
        value={suggestedCarrier ?? ""}
        onChange={(e) => onSuggestedCarrierChange(lineId, e.target.value)}
        aria-label={`Kod nośnika sugerowanego dla pozycji ${lineId}`}
      />
    </div>
  );
}

function DeliveryDiffConfirmDialog({
  open,
  lineLabel,
  ordered,
  received,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  lineLabel: string;
  ordered: number;
  received: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const shortage = deliveryShortageQty(ordered, received);

  return (
    <WarehouseDocumentOverlayPortal
      className="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
      onBackdropClick={onCancel}
    >
      <div
        role="dialog"
        aria-labelledby="delivery-diff-confirm-title"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delivery-diff-confirm-title" className="text-base font-semibold text-slate-900">
          Zaakceptuj różnicę dostawy
        </h2>
        <p className="mt-1 text-xs text-slate-500">{lineLabel}</p>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3 text-sm">
          <dt className="text-slate-500">Ilość z dokumentu</dt>
          <dd className="text-right font-medium tabular-nums text-slate-900">{fmtQty(ordered)}</dd>
          <dt className="text-slate-500">Ilość rzeczywista</dt>
          <dd className="text-right font-medium tabular-nums text-slate-900">{fmtQty(received)}</dd>
          <dt className="text-slate-500">Brak</dt>
          <dd className="text-right font-semibold tabular-nums text-red-600">{fmtQty(shortage)}</dd>
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          Potwierdzasz, że różnica między ilością zamówioną a przyjętą jest znana i akceptowana.
          Decyzja jest zapisana tylko w tej sesji widoku — nie zmienia stanu magazynowego.
          Aby zaksięgować PZ, użyj przycisku „Zatwierdź przyjęcie” z aktualną ilością przyjętą.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Blokada sprzedaży dotyczy wyłącznie towaru fizycznie przyjętego na magazyn.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
          >
            Potwierdź
          </button>
        </div>
      </div>
    </WarehouseDocumentOverlayPortal>
  );
}

function WarehouseDocumentSummaryPanel({
  isWzDetail,
  lineSummary,
}: {
  isWzDetail: boolean;
  lineSummary: WarehouseLineSummary;
}) {
  const qtyLeft = isWzDetail ? (
    <>
      <WarehouseDocSummaryItem label="Pozycji" value={String(lineSummary.lineCount)} />
      <WarehouseDocSummarySeparator />
      <WarehouseDocSummaryItem label="Suma ilości" value={fmtQty(lineSummary.sumOrdered)} />
    </>
  ) : (
    <>
      <WarehouseDocSummaryItem label="Pozycji" value={String(lineSummary.lineCount)} />
      <WarehouseDocSummarySeparator />
      <WarehouseDocSummaryItem label="Ilość z dokumentu" value={fmtQty(lineSummary.sumOrdered)} />
      <WarehouseDocSummarySeparator />
      <WarehouseDocSummaryItem label="Ilość rzeczywista" value={fmtQty(lineSummary.sumReceived)} />
      <WarehouseDocSummarySeparator />
      <WarehouseDocSummaryItem
        label="Różnica"
        value={<span className={diffToneClass(lineSummary.sumDiff)}>{fmtQty(lineSummary.sumDiff)}</span>}
      />
    </>
  );

  return (
    <WarehouseDocSummaryBar
      left={qtyLeft}
      className="shrink-0 border-t border-slate-200 bg-slate-50/60 px-3 py-1.5 text-[12px]"
    />
  );
}
