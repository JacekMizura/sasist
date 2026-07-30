import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

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

export function OrderSummaryProductsList({ lines, productEditTenantId, onLineAction, compact = false }: Props) {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const gridCols =
    "grid-cols-[minmax(0,1fr)_44px_52px_minmax(0,72px)_minmax(0,72px)_minmax(0,88px)_minmax(0,88px)_minmax(0,52px)_40px]";

  if (lines.length === 0) {
    return <p className="text-sm text-slate-500">Brak pozycji.</p>;
  }

  if (compact) {
    return (
      <div className="w-full min-w-0 overflow-x-auto rounded border border-slate-200">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50">
              <th className="w-[65%] px-4 py-2 text-xs font-normal text-slate-500">Produkt</th>
              <th className="w-[5%] px-4 py-2 text-center text-xs font-normal text-slate-500">VAT</th>
              <th className="w-[10%] px-4 py-2 text-center text-xs font-normal text-slate-500">Ilość</th>
              <th className="w-[15%] px-4 py-2 text-right text-xs font-normal text-slate-500">Cena i wartość</th>
              <th className="w-[5%] px-4 py-2" aria-hidden />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {lines.map((row) => {
              const pid = row.item.product?.id;
              const canProductLink =
                pid != null &&
                Number.isFinite(Number(pid)) &&
                Number(pid) > 0 &&
                productEditTenantId != null &&
                productEditTenantId > 0;
              const qty = Number(row.item.quantity);
              const qtyHighlight = Number.isFinite(qty) && qty > 1;
              const metaBits: { label: string; value: string; strong?: boolean }[] = [];
              if (row.sku.trim()) metaBits.push({ label: "SKU", value: row.sku });
              if (row.ean.trim()) metaBits.push({ label: "EAN", value: row.ean });
              if (row.catalog.trim()) metaBits.push({ label: "Nr kat", value: row.catalog });
              if (row.location.trim()) metaBits.push({ label: "Lok", value: row.location });
              if (row.basket.trim()) metaBits.push({ label: "Kosz", value: row.basket });

              return (
                <tr key={row.item.id} className="align-top">
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 shrink-0 rounded border border-slate-200 p-0.5">
                        {row.imageUrl ? (
                          <img
                            src={row.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                            —
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          {canProductLink ? (
                            <Link
                              to={getProductDetailsPath(pid)}
                              state={productDetailsNavState({ tenantId: productEditTenantId })}
                              className="text-sm font-medium text-blue-600 hover:underline"
                            >
                              {row.name}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-slate-900">{row.name}</span>
                          )}
                        </div>
                        {metaBits.length > 0 ? (
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                            {metaBits.map((m) => (
                              <span key={`${row.item.id}-${m.label}`}>
                                {m.label}:{" "}
                                <span
                                  className={
                                    m.label === "Nr kat"
                                      ? "border-b border-dashed border-slate-400 text-slate-900"
                                      : "text-slate-900"
                                  }
                                >
                                  {m.value}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center text-sm text-slate-700">{row.vatLabel}</td>
                  <td className="px-4 py-4 text-center">
                    {qtyHighlight ? (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-amber-100 text-sm font-bold text-amber-800">
                        {row.quantityDisplay}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-900">{row.quantityDisplay}</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {qtyHighlight || (row.rabatDisplay && row.rabatDisplay !== "—") ? (
                      <>
                        <div className="text-[11px] text-slate-500">
                          {row.unitGross}
                          {row.rabatDisplay && row.rabatDisplay !== "—" ? (
                            <span className="ml-1 text-red-500">-{row.rabatDisplay.replace(/^-/, "")}</span>
                          ) : null}
                        </div>
                        <div className="text-sm font-bold text-slate-900">{row.lineGross}</div>
                      </>
                    ) : (
                      <div className="text-sm text-slate-900">{row.lineGross}</div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <OrderLineKebabMenu
                      lineId={row.item.id}
                      anchorId={`order-summary-line-kebab-${row.item.id}`}
                      open={openMenuId === row.item.id}
                      onOpenChange={(next) => setOpenMenuId(next ? row.item.id : null)}
                      onEdit={() => onLineAction?.("edit", row.item)}
                      onRabat={() => onLineAction?.("rabat", row.item)}
                      onRemove={() => onLineAction?.("remove", row.item)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
