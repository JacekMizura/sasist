import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

import { useMediaQuery } from "../../hooks/useMediaQuery";
import { getProductDetailsPath, productDetailsNavState } from "../../pages/Products/productPaths";
import { OrderLineKebabMenu } from "./OrderLineKebabMenu";
import type { LogicalOrderEvent } from "./logicalOrderItems";

/** Minimal item shape for podsumowanie (bez WMS). */
export type OrderSummaryProductItem = {
  id: number;
  quantity: number;
  product?: {
    id?: number;
    name?: string | null;
    ean?: string | null;
    symbol?: string | null;
    sku?: string | null;
    image_url?: string | null;
  } | null;
  vat_percent?: number | null;
  total_price?: number | null;
  unit_price?: number | null;
  unit_price_net?: number | null;
  unit_price_gross?: number | null;
  line_net_total?: number | null;
  line_gross_total?: number | null;
  line_margin_percent?: number | null;
  oms_line_status?: string | null;
};

export type OrderSummaryProductsListLine = {
  item: OrderSummaryProductItem;
  imageUrl: string | null;
  name: string;
  sku: string;
  ean: string;
  catalog: string;
  location: string;
  basket: string;
  vatLabel: string;
  quantityDisplay: string;
  /** Jednostkowo netto / brutto — puste gdy brak danych. */
  unitNet: string;
  unitGross: string;
  lineNet: string;
  lineGross: string;
  marginPct: string;
  /** Kolorystyka kolumny marży: zysk / strata / brak kosztu zakupu. */
  marginTone?: "positive" | "negative" | "warn" | "neutral";
  /** Rabat linii vs cena katalogowa (np. „12%”) — jak w `formatLineDiscountLabel`. */
  rabatDisplay: string;
  /** Korzeń linii logicznej (stabilny klucz UI). */
  lineageRootId?: number;
  lineageMemberIds?: number[];
  /** Timeline zdarzeń — rozwijany pod kartą, nie osobna karta. */
  eventTimeline?: LogicalOrderEvent[];
};

export type OrderSummaryLineMenuAction = "edit" | "rabat" | "remove";

type Props = {
  lines: OrderSummaryProductsListLine[];
  /** Tenant przekazywany do `/products/:id/edit` (jak lista asortymentu). */
  productEditTenantId?: number | null;
  /** Akcje kebaba: edycja pełna, rabat (focus sekcji rabatu), usunięcie (potwierdzenie po stronie rodzica). */
  onLineAction?: (action: OrderSummaryLineMenuAction, item: OrderSummaryProductItem) => void;
  /** Skrócona lista (Podsumowanie); pełna siatka VAT/marży zostaje w „Produkty i magazyn”. */
  compact?: boolean;
};

function marginCellClass(tone: OrderSummaryProductsListLine["marginTone"]): string {
  if (tone === "negative") return "text-rose-700";
  if (tone === "positive") return "text-emerald-800";
  if (tone === "warn") return "text-amber-800";
  return "text-slate-700";
}

const COMPACT_LABEL = "text-[10px] uppercase tracking-[0.08em] text-slate-400";

type CompactTier = "primary" | "secondary" | "tertiary";

function CompactMetricCell({
  label,
  tier,
  align = "right",
  children,
  className,
}: {
  label: string;
  tier: CompactTier;
  align?: "left" | "right";
  children: ReactNode;
  className?: string;
}) {
  const alignCls = align === "right" ? "items-end text-right" : "items-start text-left";
  const valueCls =
    tier === "primary"
      ? "text-lg font-bold tabular-nums leading-tight text-slate-900"
      : tier === "secondary"
        ? "text-sm font-semibold tabular-nums leading-tight text-slate-800"
        : "text-xs font-medium tabular-nums leading-tight text-slate-600";
  return (
    <div className={`flex min-h-0 shrink-0 flex-col justify-center gap-0.5 ${alignCls} ${className ?? ""}`}>
      <span className={COMPACT_LABEL}>{label}</span>
      <div className={valueCls}>{children}</div>
    </div>
  );
}

function CompactMarginBadge({
  item,
  marginPct,
  marginTone,
}: {
  item: OrderSummaryProductItem;
  marginPct: string;
  marginTone?: OrderSummaryProductsListLine["marginTone"];
}) {
  const mp = item.line_margin_percent;
  const tone = marginTone ?? "neutral";
  if (tone === "warn" && (mp == null || !Number.isFinite(Number(mp)))) {
    return (
      <span className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
        <span className="tabular-nums">{marginPct}</span>
      </span>
    );
  }
  if (mp != null && Number.isFinite(Number(mp))) {
    const n = Number(mp);
    if (n > 0) {
      return (
        <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 tabular-nums">
          {marginPct}
        </span>
      );
    }
    if (n < 0) {
      return (
        <span className="inline-block rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 tabular-nums">
          {marginPct}
        </span>
      );
    }
  }
  return (
    <span className="inline-block rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 tabular-nums">
      {marginPct}
    </span>
  );
}

export function OrderSummaryProductsList({ lines, productEditTenantId, onLineAction, compact = false }: Props) {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  /** Jeden kebab na wiersz — dwa montowane naraz psują Floating UI (kliknięcia w menu nie docierają). */
  const mdUp = useMediaQuery("(min-width: 768px)");

  const gridCols =
    "grid-cols-[minmax(0,1fr)_44px_52px_minmax(0,72px)_minmax(0,72px)_minmax(0,88px)_minmax(0,88px)_minmax(0,52px)_40px]";

  if (lines.length === 0) {
    return <p className="text-sm text-slate-500">Brak pozycji.</p>;
  }

  if (compact) {
    return (
      <div className="min-w-0 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {lines.map((row) => {
          const skuEan = [row.sku, row.ean]
            .map((x) => (x ?? "").trim())
            .filter(Boolean)
            .join(" · ");
          const pid = row.item.product?.id;
          const canProductLink =
            pid != null && Number.isFinite(Number(pid)) && Number(pid) > 0 && productEditTenantId != null && productEditTenantId > 0;
          const productLinkCls =
            "line-clamp-2 text-base font-semibold leading-snug text-slate-900 underline decoration-transparent underline-offset-2 hover:decoration-slate-300";
          return (
            <div key={row.item.id} className="relative px-2.5 py-2 transition-colors hover:bg-slate-50/60">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3 pr-10 md:pr-0">
                  <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center">
                    {row.imageUrl ? (
                      <img src={row.imageUrl} alt="" className="max-h-[52px] max-w-[52px] object-contain" loading="lazy" />
                    ) : (
                      <span className="text-[10px] text-slate-400">—</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    {canProductLink ? (
                      <Link
                        to={getProductDetailsPath(pid)}
                        state={productDetailsNavState({ tenantId: productEditTenantId })}
                        className={productLinkCls}
                      >
                        {row.name}
                      </Link>
                    ) : (
                      <span className="line-clamp-2 text-base font-semibold leading-snug text-slate-900">{row.name}</span>
                    )}
                    {skuEan ? <p className="mt-0.5 truncate text-xs text-slate-500">{skuEan}</p> : null}
                  </div>
                </div>

                {!mdUp ? (
                  <div className="absolute right-3 top-2.5">
                    <OrderLineKebabMenu
                      lineId={row.item.id}
                      anchorId={`order-summary-line-kebab-${row.item.id}`}
                      open={openMenuId === row.item.id}
                      onOpenChange={(next) => setOpenMenuId(next ? row.item.id : null)}
                      onEdit={() => onLineAction?.("edit", row.item)}
                      onRabat={() => onLineAction?.("rabat", row.item)}
                      onRemove={() => onLineAction?.("remove", row.item)}
                    />
                  </div>
                ) : null}

                {/* Desktop metryki: większy odstęp od produktu (gap-8), między kolumnami gap-6 */}
                {mdUp ? (
                  <div className="flex min-w-0 max-w-none flex-1 flex-nowrap items-center justify-end gap-x-4 overflow-x-auto [scrollbar-width:thin]">
                    <CompactMetricCell tier="tertiary" label="Ilość">
                      {row.quantityDisplay}
                    </CompactMetricCell>
                    <CompactMetricCell tier="secondary" label="Netto/szt">
                      {row.unitNet}
                    </CompactMetricCell>
                    <CompactMetricCell tier="secondary" label="Brutto/szt">
                      {row.unitGross}
                    </CompactMetricCell>
                    <CompactMetricCell tier="tertiary" label="VAT">
                      {row.vatLabel}
                    </CompactMetricCell>
                    <CompactMetricCell tier="tertiary" label="Rabat">
                      {row.rabatDisplay}
                    </CompactMetricCell>
                    <div className="flex shrink-0 items-center gap-3 border-l border-slate-200 pl-4">
                      <CompactMetricCell tier="primary" label="Wartość">
                        {row.lineGross}
                      </CompactMetricCell>
                      <OrderLineKebabMenu
                        lineId={row.item.id}
                        anchorId={`order-summary-line-kebab-${row.item.id}`}
                        open={openMenuId === row.item.id}
                        onOpenChange={(next) => setOpenMenuId(next ? row.item.id : null)}
                        onEdit={() => onLineAction?.("edit", row.item)}
                        onRabat={() => onLineAction?.("rabat", row.item)}
                        onRemove={() => onLineAction?.("remove", row.item)}
                      />
                    </div>
                  </div>
                ) : null}

                {/* Mobile */}
                <div className="space-y-2 border-t border-slate-100 pt-2 md:hidden">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    <CompactMetricCell tier="tertiary" label="Ilość" align="left">
                      {row.quantityDisplay}
                    </CompactMetricCell>
                    <CompactMetricCell tier="secondary" label="Netto/szt" align="left">
                      {row.unitNet}
                    </CompactMetricCell>
                    <CompactMetricCell tier="secondary" label="Brutto/szt" align="left">
                      {row.unitGross}
                    </CompactMetricCell>
                    <CompactMetricCell tier="tertiary" label="VAT" align="left">
                      {row.vatLabel}
                    </CompactMetricCell>
                    <CompactMetricCell tier="tertiary" label="Rabat" align="left">
                      {row.rabatDisplay}
                    </CompactMetricCell>
                    <CompactMetricCell tier="primary" label="Wartość" align="left">
                      {row.lineGross}
                    </CompactMetricCell>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <div className="min-w-[980px] border border-slate-200 bg-white">
        <div
          className={`grid ${gridCols} items-center gap-x-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500`}
        >
          <div>Produkt</div>
          <div className="text-right">VAT</div>
          <div className="text-right">Ilość</div>
          <div className="text-right">Net/szt</div>
          <div className="text-right">Brut/szt</div>
          <div className="text-right">Razem net</div>
          <div className="text-right">Razem brut</div>
          <div className="text-right">Marża</div>
          <div className="text-right" aria-hidden />
        </div>
        <div className="divide-y divide-slate-200">
        {lines.map((row) => {
          const meta = [row.sku, row.ean, row.catalog, row.location, row.basket]
            .map((x) => (x ?? "").trim())
            .filter(Boolean)
            .join(" · ");
          const pid = row.item.product?.id;
          const canProductLink =
            pid != null && Number.isFinite(Number(pid)) && Number(pid) > 0 && productEditTenantId != null && productEditTenantId > 0;
          const marginTone = row.marginTone ?? "neutral";
          return (
            <div
              key={row.item.id}
              className={`grid ${gridCols} items-center gap-x-3 px-3 py-2.5 text-sm`}
            >
              <div className="min-w-0">
                {canProductLink ? (
                  <Link
                    to={getProductDetailsPath(pid)}
                    state={productDetailsNavState({ tenantId: productEditTenantId })}
                    className="group flex min-w-0 cursor-pointer items-start gap-3 rounded-md outline-none ring-offset-2 transition hover:bg-slate-50/90 focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center transition">
                      {row.imageUrl ? (
                        <img src={row.imageUrl} alt="" className="max-h-12 max-w-12 object-contain" loading="lazy" />
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate pt-0.5 font-semibold text-slate-900 underline decoration-transparent underline-offset-2 transition group-hover:text-slate-950 group-hover:decoration-slate-300">
                      {row.name}
                    </span>
                  </Link>
                ) : (
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center">
                      {row.imageUrl ? (
                        <img src={row.imageUrl} alt="" className="max-h-12 max-w-12 object-contain" loading="lazy" />
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate pt-0.5 font-semibold text-slate-900">{row.name}</span>
                  </div>
                )}
                {meta ? (
                  <p className="mt-0.5 truncate pl-[3.75rem] text-xs text-slate-500">{meta}</p>
                ) : null}
              </div>
              <div className="text-right text-sm tabular-nums text-slate-700">{row.vatLabel}</div>
              <div className="text-right text-sm font-medium tabular-nums text-slate-900">{row.quantityDisplay}</div>
              <div className="text-right text-[13px] tabular-nums text-slate-800">{row.unitNet}</div>
              <div className="text-right text-[13px] tabular-nums text-slate-800">{row.unitGross}</div>
              <div className="text-right text-[13px] font-medium tabular-nums text-slate-900">{row.lineNet}</div>
              <div className="text-right text-[13px] font-medium tabular-nums text-slate-900">{row.lineGross}</div>
              <div className={`flex items-center justify-end gap-1 text-right text-[13px] tabular-nums ${marginCellClass(marginTone)}`}>
                {marginTone === "warn" ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                ) : null}
                <span>{row.marginPct}</span>
              </div>
              <div className="flex justify-end">
                <OrderLineKebabMenu
                  lineId={row.item.id}
                  anchorId={`order-summary-line-kebab-${row.item.id}`}
                  open={openMenuId === row.item.id}
                  onOpenChange={(next) => setOpenMenuId(next ? row.item.id : null)}
                  onEdit={() => onLineAction?.("edit", row.item)}
                  onRabat={() => onLineAction?.("rabat", row.item)}
                  onRemove={() => onLineAction?.("remove", row.item)}
                />
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
