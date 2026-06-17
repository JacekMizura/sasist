import { useState } from "react";
import type { StockDocumentItemRead, StockDocumentRead } from "../../api/stockDocumentsApi";
import { AppStatCard } from "../../components/app-shell/AppStatCard";
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
  receiptLineDisplayName,
  receiptLineStatusLabel,
  WarehouseLineLocationCell,
  WarehouseLineProductThumb,
  WarehouseLineStatusBadge,
  wzLineStatusLabel,
} from "./warehouseDocumentLineUi";

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

function fmtMoneyCur(n: number | null | undefined, currency: string | undefined) {
  const c = (currency || "PLN").trim() || "PLN";
  if (n == null || !Number.isFinite(n)) return "—";
  if (c === "PLN" || c === "zł") return formatMoneyPl(n);
  return formatMoneyPl(n, { currency: c });
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
}: Props) {
  const thCls =
    "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const thRightCls = `${thCls} text-right`;
  const tdCls = "px-3 py-2 align-middle";

  type DrawerState =
    | { kind: "sales_block"; line: StockDocumentItemRead; index: number }
    | { kind: "block_history"; line: StockDocumentItemRead; index: number }
    | { kind: "line_detail"; line: StockDocumentItemRead; index: number }
    | null;

  const [drawer, setDrawer] = useState<DrawerState>(null);

  function openLineAction(index: number, line: StockDocumentItemRead, kind: LineActionKind) {
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

  const actionCol = showPurchaseSalesBlock && !isWzDetail;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Pozycje</h3>
      </div>

      {detail.items.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-600">Brak pozycji na dokumencie.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className={`${thCls} w-10 text-center`}>#</th>
                  <th className={`${thCls} pl-2`}>Nazwa</th>
                  <th className={thRightCls}>{isWzDetail ? "Ilość" : "Zamówiono"}</th>
                  {!isWzDetail ? <th className={thRightCls}>Przyjęto</th> : null}
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
                    onLineAction={(kind) => openLineAction(index, it, kind)}
                    tdCls={tdCls}
                  />
                ))}
              </tbody>
            </table>
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
            onClose={() => setDrawer(null)}
          />

          {lineSummary ? (
            <WarehouseDocumentSummaryPanel
              detail={detail}
              isWzDetail={isWzDetail}
              lineSummary={lineSummary}
            />
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
  onLineAction,
  tdCls,
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
  onLineAction: (kind: LineActionKind) => void;
  tdCls: string;
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

  return (
    <tr className="transition-colors hover:bg-slate-50/40">
      <td className={`${tdCls} text-center tabular-nums text-xs font-semibold text-slate-500`}>
        {index + 1}
      </td>
      <td className={`${tdCls} pl-2`}>
        <div className="flex items-center gap-2.5">
          <WarehouseLineProductThumb url={wmsReceiptLineImageUrl(it)} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium leading-tight text-slate-900">{receiptLineDisplayName(it)}</div>
            <div className="mt-0.5 text-[11px] leading-tight text-slate-500">
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
              className={`${inputClass} inline-block w-[5.5rem] py-1.5 text-sm`}
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
        <WarehouseLineLocationCell it={it} isWz={isWzDetail} />
      </td>
      <td className={tdCls}>
        <WarehouseLineStatusBadge label={statusLabel} />
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
            onAction={onLineAction}
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

function WarehouseDocumentSummaryPanel({
  detail,
  isWzDetail,
  lineSummary,
}: {
  detail: StockDocumentRead;
  isWzDetail: boolean;
  lineSummary: WarehouseLineSummary;
}) {
  const currency = detail.currency;
  const netTotal =
    detail.total_net != null && Number.isFinite(detail.total_net)
      ? detail.total_net
      : lineSummary.sumValueNet;
  const grossTotal =
    detail.total_gross != null && Number.isFinite(detail.total_gross)
      ? detail.total_gross
      : lineSummary.sumValueGross;
  const vatTotal =
    detail.total_vat != null && Number.isFinite(detail.total_vat)
      ? detail.total_vat
      : lineSummary.sumVat;

  const qtyCards = isWzDetail
    ? [
        { label: "Pozycji", value: String(lineSummary.lineCount) },
        { label: "Suma ilości", value: fmtQty(lineSummary.sumOrdered) },
      ]
    : [
        { label: "Pozycji", value: String(lineSummary.lineCount) },
        { label: "Suma zamówiona", value: fmtQty(lineSummary.sumOrdered) },
        { label: "Suma przyjęta", value: fmtQty(lineSummary.sumReceived) },
        {
          label: "Różnica",
          value: fmtQty(lineSummary.sumDiff),
          hint: undefined as string | undefined,
        },
      ];

  const financialCards = [
    { label: "Netto", value: fmtMoneyCur(netTotal, currency) },
    { label: "VAT", value: fmtMoneyCur(vatTotal, currency) },
    { label: "Brutto", value: fmtMoneyCur(grossTotal, currency) },
  ];

  return (
    <div className="border-t border-slate-100 bg-slate-50/30 px-5 py-5">
      <p className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">Podsumowanie</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {qtyCards.map((c) => (
          <AppStatCard
            key={c.label}
            label={c.label}
            value={
              c.label === "Różnica" ? (
                <span className={diffToneClass(lineSummary.sumDiff)}>{c.value}</span>
              ) : (
                c.value
              )
            }
          />
        ))}
        {financialCards.map((c) => (
          <AppStatCard key={c.label} label={c.label} value={c.value} />
        ))}
      </div>
    </div>
  );
}
