import type { ReactNode } from "react";
import { useEffect } from "react";
import type { StockDocumentItemRead } from "../../api/stockDocumentsApi";
import { formatMoneyPl } from "../../utils/formatOrderMoney";
import { WarehouseDocumentOverlayPortal } from "./WarehouseDocumentOverlayPortal";
import {
  DeliveryDifferenceAcceptedBadge,
  deliveryShortageQty,
  hasDeliveryQuantityDiff,
  receiptLineDisplayName,
  receiptLineLocationCode,
  receiptLineStatusLabel,
  WarehouseLineLocationCell,
  WarehouseLineStatusBadge,
  WarehouseLineTypeBadge,
} from "./warehouseDocumentLineUi";

type Mode = "detail" | "block_history";

type Props = {
  open: boolean;
  mode: Mode;
  line: StockDocumentItemRead | null;
  lineIndex: number;
  deliveryDiffAccepted?: boolean;
  onClose: () => void;
};

function fmtQty(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 6 }).format(n);
}

export function WarehouseDocumentLineDetailDrawer({
  open,
  mode,
  line,
  lineIndex,
  deliveryDiffAccepted = false,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || line == null) return null;

  const title = mode === "detail" ? "Szczegóły pozycji" : "Historia blokad";
  const ean = (line.product_ean || "").trim();
  const sku = (line.product_sku || "").trim();
  const effectiveBlock = Number(line.sales_block_effective_qty ?? line.sales_blocked_qty ?? 0);
  const ordered = Number(line.ordered_quantity) || 0;
  const received = Number(line.received_quantity) || 0;
  const shortage = deliveryShortageQty(ordered, received);
  const showShortage = hasDeliveryQuantityDiff(ordered, received);

  return (
    <WarehouseDocumentOverlayPortal
      className="fixed inset-0 flex justify-end bg-black/30"
      onBackdropClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-labelledby="line-detail-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</p>
            <h2 id="line-detail-drawer-title" className="mt-1 text-sm font-semibold text-slate-900">
              Pozycja #{lineIndex + 1}
            </h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">{receiptLineDisplayName(line)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Zamknij
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
          {mode === "detail" ? (
            <dl className="grid gap-3">
              <DetailRow label="Typ pozycji">
                <WarehouseLineTypeBadge type={line.receipt_line_type ?? line.item_type} />
              </DetailRow>
              <DetailRow label="EAN">{ean || "—"}</DetailRow>
              <DetailRow label="SKU">{sku || "—"}</DetailRow>
              <DetailRow label="Zamówiono">{fmtQty(ordered)}</DetailRow>
              <DetailRow label="Przyjęto">{fmtQty(received)}</DetailRow>
              {showShortage ? (
                <DetailRow label="Brak">
                  <span className="font-semibold tabular-nums text-red-600">{fmtQty(shortage)}</span>
                </DetailRow>
              ) : null}
              <DetailRow label="Różnica">{fmtQty(received - ordered)}</DetailRow>
              <DetailRow label="Status">
                <div className="flex flex-wrap items-center gap-1.5">
                  <WarehouseLineStatusBadge label={receiptLineStatusLabel(line)} />
                  {deliveryDiffAccepted ? (
                    <DeliveryDifferenceAcceptedBadge received={received} />
                  ) : null}
                </div>
              </DetailRow>
              <DetailRow label="Lokalizacja">
                <WarehouseLineLocationCell it={line} isWz={false} />
              </DetailRow>
              <DetailRow label="Cena netto">
                {line.purchase_price_net != null ? formatMoneyPl(line.purchase_price_net) : "—"}
              </DetailRow>
              <DetailRow label="Wartość netto">
                {line.value_net != null ? formatMoneyPl(line.value_net) : "—"}
              </DetailRow>
              {line.product_id != null ? (
                <DetailRow label="ID produktu">#{line.product_id}</DetailRow>
              ) : null}
            </dl>
          ) : (
            <div className="space-y-3">
              {effectiveBlock > 0 || line.sales_block_reason_label ? (
                <dl className="grid gap-3 rounded-lg border border-amber-200/80 bg-amber-50/40 px-3 py-3">
                  <DetailRow label="Zablokowana ilość">{fmtQty(effectiveBlock)}</DetailRow>
                  <DetailRow label="Powód">{line.sales_block_reason_label || "—"}</DetailRow>
                  <DetailRow label="Notatka">{line.sales_block_note?.trim() || "—"}</DetailRow>
                  {line.sales_blocked_at ? (
                    <DetailRow label="Data blokady">
                      {new Date(line.sales_blocked_at).toLocaleString("pl-PL")}
                    </DetailRow>
                  ) : null}
                  {line.sales_blocked_by_user_id != null ? (
                    <DetailRow label="Użytkownik">#{line.sales_blocked_by_user_id}</DetailRow>
                  ) : null}
                </dl>
              ) : (
                <p className="text-sm text-slate-600">Brak zapisanej blokady sprzedaży dla tej pozycji.</p>
              )}
              {receiptLineLocationCode(line) ? (
                <p className="text-xs text-slate-500">
                  Lokalizacja: <span className="font-medium text-slate-700">{receiptLineLocationCode(line)}</span>
                </p>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </WarehouseDocumentOverlayPortal>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 border-b border-slate-100 pb-2 last:border-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}
