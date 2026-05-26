import type { WmsPackingOrderLineApi } from "../../api/wmsPackingApi";
import { fmtOmsQty } from "./omsFulfillmentLinePresentation";
import { panelHistoryAffectedQty, panelHistoryOrderedQty } from "./panelFulfillmentHistoryDisplay";

function formatMoney(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const cur = (currency && currency.trim()) || "PLN";
  try {
    return new Intl.NumberFormat("pl-PL", { style: "currency", currency: cur }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} ${cur}`;
  }
}

export type HistoricalOrderItemLike = {
  id: number;
  quantity: number;
  unit_price?: number | null;
  total_price?: number | null;
  oms_replacement_original_quantity?: number | null;
  oms_replacement_transferred_quantity?: number | null;
  product?: {
    name?: string | null;
    image_url?: string | null;
    ean?: string | null;
    symbol?: string | null;
    sku?: string | null;
  };
};

function identitySku(p?: HistoricalOrderItemLike["product"]): string {
  const s = (p?.symbol ?? p?.sku ?? "").trim();
  return s || "—";
}

function identityEan(p?: HistoricalOrderItemLike["product"]): string {
  const s = (p?.ean ?? "").trim();
  return s || "—";
}

export type PanelFulfillmentHistoryEntryUi = {
  at: string;
  lines: string[];
  kind?: string | null;
  product_name?: string | null;
  product_sku?: string | null;
  product_ean?: string | null;
  quantity_ordered?: number | null;
  quantity_before?: number | null;
  quantity_affected?: number | null;
  unit_price?: number | null;
  line_total?: number | null;
};

type PanelEntryProps = {
  entry: PanelFulfillmentHistoryEntryUi;
  currency: string | null | undefined;
  formatDetailDate: (iso: string | null | undefined) => string;
};

/**
 * Pojedynczy wpis „Usunięcia i rozwiązania braków” — pełna identyfikacja produktu i wartości.
 */
export function PanelFulfillmentHistoryEntryCard({ entry, currency, formatDetailDate }: PanelEntryProps) {
  const nm = (entry.product_name ?? "").trim();
  const sku = (entry.product_sku ?? "").trim() || "—";
  const ean = (entry.product_ean ?? "").trim() || "—";
  const kind = (entry.kind ?? "").trim();
  const ordered = panelHistoryOrderedQty(entry);
  const affected = panelHistoryAffectedQty(entry);
  const up = entry.unit_price != null && Number.isFinite(Number(entry.unit_price)) ? Number(entry.unit_price) : null;
  const lt = entry.line_total != null && Number.isFinite(Number(entry.line_total)) ? Number(entry.line_total) : null;

  const title =
    kind === "order_line_removed"
      ? "Usunięto z zamówienia"
      : kind === "shortage_reduced"
        ? "Zmniejszono zamówienie (brak)"
        : "Zapis realizacji";

  return (
    <li className="border-t border-slate-200/70 pt-2.5 text-slate-600 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-medium text-slate-500">{formatDetailDate(entry.at)}</p>
      <div className="mt-1.5 rounded-lg border border-slate-200/90 bg-white p-3 shadow-sm">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600">{title}</p>
        {nm ? <p className="mt-2 text-sm font-semibold leading-snug text-slate-900">{nm}</p> : null}
        <dl className="mt-2 grid gap-1.5 text-xs text-slate-700">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <dt className="font-semibold text-slate-500">SKU</dt>
            <dd className="font-medium tabular-nums text-slate-800">{sku}</dd>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <dt className="font-semibold text-slate-500">EAN</dt>
            <dd className="font-medium tabular-nums text-slate-800">{ean}</dd>
          </div>
          {ordered != null ? (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              <dt className="font-semibold text-slate-500">Zamówiono</dt>
              <dd className="tabular-nums">{fmtOmsQty(ordered)} szt.</dd>
            </div>
          ) : null}
          {affected != null ? (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              <dt className="font-semibold text-slate-500">{kind === "shortage_reduced" ? "Zmniejszono" : "Usunięto"}</dt>
              <dd className="tabular-nums">{fmtOmsQty(affected)} szt.</dd>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <dt className="font-semibold text-slate-500">Cena jedn.</dt>
            <dd className="tabular-nums">{up != null ? formatMoney(up, currency) : "—"}</dd>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <dt className="font-semibold text-slate-500">Wartość (wpływ)</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{lt != null ? formatMoney(lt, currency) : "—"}</dd>
          </div>
        </dl>
        {entry.lines?.length ? (
          <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-xs text-slate-500">
            {entry.lines.map((ln, i) => (
              <p key={i} className="whitespace-pre-line">
                {ln}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** Ilość „sprzed zamiany” na zarchiwizowanej linii (snapshot OMS). */
export function historicalReplacedOldQuantity(it: HistoricalOrderItemLike): number {
  const tq = it.oms_replacement_transferred_quantity;
  if (tq != null && Number.isFinite(Number(tq)) && Number(tq) > 0) return Math.round(Number(tq));
  const oq = it.oms_replacement_original_quantity;
  if (oq != null && Number.isFinite(Number(oq)) && Number(oq) > 0) return Math.round(Number(oq));
  return 0;
}

type ReplacedArchiveRowProps = {
  it: HistoricalOrderItemLike;
  wm: WmsPackingOrderLineApi | undefined;
  successor: HistoricalOrderItemLike | undefined;
  successorWm: WmsPackingOrderLineApi | undefined;
  currency: string | null | undefined;
};

function proportionalTransferredLineTotal(it: HistoricalOrderItemLike): number | null {
  const transQ = historicalReplacedOldQuantity(it);
  if (transQ <= 0) return null;
  const origQ = it.oms_replacement_original_quantity != null ? Number(it.oms_replacement_original_quantity) : 0;
  const tp = it.total_price != null ? Number(it.total_price) : null;
  const up = it.unit_price != null ? Number(it.unit_price) : null;
  if (origQ > 0 && tp != null && Number.isFinite(tp)) {
    return (transQ / origQ) * tp;
  }
  if (up != null && Number.isFinite(up)) {
    return transQ * up;
  }
  return null;
}

function ProductIdentityBlock({
  title,
  name,
  sku,
  ean,
  qty,
  unitPrice,
  lineTotal,
  currency,
  muted,
  imageUrl,
}: {
  title: string;
  name: string;
  sku: string;
  ean: string;
  qty: number;
  unitPrice: number | null | undefined;
  lineTotal: number | null | undefined;
  currency: string | null | undefined;
  muted?: boolean;
  imageUrl?: string | null;
}) {
  const wrap = muted ? "opacity-[0.72]" : "";
  const nameCls = muted
    ? "font-semibold leading-snug text-slate-500 line-through decoration-slate-400"
    : "font-semibold leading-snug text-slate-900";
  const imgShell = muted ? "border-slate-200 bg-slate-200/60 grayscale" : "border-slate-200 bg-white";
  return (
    <div className={`rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-sm ${wrap}`}>
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-1.5 flex items-start gap-3">
        <div className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border ${imgShell}`}>
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">—</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={nameCls}>{name}</p>
          <dl className="mt-2 space-y-1 text-xs text-slate-700">
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-slate-500">SKU</dt>
              <dd className="font-medium tabular-nums">{sku || "—"}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-slate-500">EAN</dt>
              <dd className="font-medium tabular-nums">{ean || "—"}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-slate-500">Ilość</dt>
              <dd className="tabular-nums">{qty > 0 ? `${fmtOmsQty(qty)} szt.` : "—"}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-slate-500">Cena jedn.</dt>
              <dd className="tabular-nums">{unitPrice != null ? formatMoney(unitPrice, currency) : "—"}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-slate-500">Wartość</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{lineTotal != null ? formatMoney(lineTotal, currency) : "—"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

/**
 * Archiwum po zamianie: porównanie stary → nowy produkt (pełna identyfikacja + wartości).
 */
export function HistoricalReplacedArchiveTableRow({ it, wm, successor, successorWm, currency }: ReplacedArchiveRowProps) {
  const oldNm = (it.product?.name ?? "").trim() || "—";
  const oldHistQty = historicalReplacedOldQuantity(it);
  const oldUnit = it.unit_price ?? undefined;
  const oldPartTotal = proportionalTransferredLineTotal(it);
  const toNm =
    (successor?.product?.name ?? "").trim() ||
    (successorWm?.product_name ?? "").trim() ||
    (wm?.replacement_new_product_name ?? "").trim() ||
    "—";
  const sq = successor ? Number(successor.quantity ?? 0) : 0;
  const newUnit = successor?.unit_price ?? undefined;
  const newTotal = successor?.total_price ?? undefined;
  const imgOld = (wm?.image_url?.trim() || it.product?.image_url?.trim() || "").trim();
  const imgNew = (successorWm?.image_url?.trim() || successor?.product?.image_url?.trim() || "").trim();
  const oldSku = identitySku(it.product);
  const oldEan = identityEan(it.product);
  const newSku = identitySku(successor?.product);
  const newEan = identityEan(successor?.product);
  const delta =
    oldPartTotal != null && newTotal != null && Number.isFinite(Number(newTotal)) ? Number(newTotal) - oldPartTotal : null;

  return (
    <div className="rounded-lg border border-slate-200/90 bg-slate-50/80 p-2.5 text-slate-600">
      <div className="space-y-2">
        <ProductIdentityBlock
          title="Poprzedni produkt"
          name={oldNm}
          sku={oldSku}
          ean={oldEan}
          qty={oldHistQty}
          unitPrice={oldUnit}
          lineTotal={oldPartTotal ?? undefined}
          currency={currency}
          muted
          imageUrl={imgOld || null}
        />
        <div className="flex flex-col items-center gap-0.5 py-0.5 text-slate-500">
          <span className="text-lg leading-none">↓</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Zamieniono na</span>
        </div>
        <ProductIdentityBlock
          title="Nowy produkt"
          name={toNm}
          sku={newSku}
          ean={newEan}
          qty={sq > 1e-9 ? Math.round(sq) : 0}
          unitPrice={newUnit}
          lineTotal={newTotal ?? undefined}
          currency={currency}
          imageUrl={imgNew || null}
        />
        {delta != null && Number.isFinite(delta) ? (
          <p className="rounded-md border border-slate-200/90 bg-white px-2.5 py-1.5 text-center text-xs text-slate-700">
            <span className="font-semibold text-slate-600">Różnica wartości (nowy − stary): </span>
            <span
              className={`font-bold tabular-nums ${delta > 1e-6 ? "text-amber-800" : delta < -1e-6 ? "text-emerald-800" : "text-slate-800"}`}
            >
              {delta > 0 ? "+" : ""}
              {formatMoney(delta, currency)}
            </span>
          </p>
        ) : null}
        <p className="text-center text-[11px] text-slate-500">Linia źródłowa: 0 szt. (historyczne, zastąpiona)</p>
      </div>
    </div>
  );
}

type RemovedGhostRowProps = {
  it: HistoricalOrderItemLike;
  wm: WmsPackingOrderLineApi | undefined;
  currency: string | null | undefined;
  removalQty: number | null;
  removalUnit: number | null | undefined;
  removalLineTotal: number | null | undefined;
  /** Z panel_fulfillment_history — pełna ilość zamówiona przed usunięciem */
  orderedQty?: number | null;
  /** Z panel_fulfillment_history — usunięta ilość (zwykle = ordered przy pełnym usunięciu) */
  removedQty?: number | null;
  skuDisplay?: string | null;
  eanDisplay?: string | null;
};

/** Linia qty=0 bez zamiany (np. usunięta / legacy) — pełna identyfikacja jak w historii panelu. */
export function HistoricalRemovedGhostTableRow({
  it,
  wm,
  currency,
  removalQty,
  removalUnit,
  removalLineTotal,
  orderedQty: orderedQtyProp,
  removedQty: removedQtyProp,
  skuDisplay,
  eanDisplay,
}: RemovedGhostRowProps) {
  const nm = (it.product?.name ?? "").trim() || "—";
  const img = (wm?.image_url?.trim() || it.product?.image_url?.trim() || "").trim();
  const fallbackRemoved = removalQty != null && removalQty > 0 ? Math.round(removalQty) : 0;
  const removedQ =
    removedQtyProp != null && Number.isFinite(Number(removedQtyProp)) && Number(removedQtyProp) > 0
      ? Math.round(Number(removedQtyProp))
      : fallbackRemoved;
  const orderedQ =
    orderedQtyProp != null && Number.isFinite(Number(orderedQtyProp)) && Number(orderedQtyProp) > 0
      ? Math.round(Number(orderedQtyProp))
      : removedQ > 0
        ? removedQ
        : fallbackRemoved;
  const unit = removalUnit ?? it.unit_price ?? undefined;
  const lt = removalLineTotal ?? it.total_price ?? undefined;
  const sku = (skuDisplay ?? "").trim() || identitySku(it.product);
  const ean = (eanDisplay ?? "").trim() || identityEan(it.product);

  return (
    <div className="rounded-lg border border-slate-200/90 bg-slate-50/80 p-2.5 text-slate-600">
      <div className="rounded-lg border border-slate-200/80 bg-slate-50/95 p-2.5 opacity-[0.92]">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600">Usunięto z zamówienia</p>
        <div className="mt-2 flex items-start gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-200/60 grayscale">
            {img ? <img src={img} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full w-full items-center justify-center text-xs">—</div>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug text-slate-600 line-through decoration-slate-400">{nm}</p>
            <dl className="mt-2 space-y-1 text-xs text-slate-700">
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-slate-500">SKU</dt>
                <dd className="font-medium tabular-nums">{sku}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-slate-500">EAN</dt>
                <dd className="font-medium tabular-nums">{ean}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-slate-500">Zamówiono</dt>
                <dd className="tabular-nums">{orderedQ > 0 ? `${fmtOmsQty(orderedQ)} szt.` : "—"}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-slate-500">Usunięto</dt>
                <dd className="tabular-nums">{removedQ > 0 ? `${fmtOmsQty(removedQ)} szt.` : "—"}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-slate-500">Cena jedn.</dt>
                <dd className="tabular-nums">{unit != null ? formatMoney(unit, currency) : "—"}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-slate-500">Wartość</dt>
                <dd className="font-semibold tabular-nums text-slate-900">{lt != null ? formatMoney(lt, currency) : "—"}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-500">Linia: 0 szt. (historyczne)</p>
    </div>
  );
}
