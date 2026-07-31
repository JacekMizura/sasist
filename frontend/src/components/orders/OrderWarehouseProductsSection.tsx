import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Package, ExternalLink } from "lucide-react";

import { getProductDetailsPath, productDetailsNavState } from "../../pages/Products/productPaths";
import { OrderLineKebabMenu } from "./OrderLineKebabMenu";
import type {
  WmsOrderTimelineEventApi,
  WmsPackingOrderCardApi,
  WmsPackingOrderLineApi,
} from "../../api/wmsPackingApi";
import { fmtOmsQty, isOmsFulfillmentSubstituteIn } from "./omsFulfillmentLinePresentation";
import OrderFulfillmentLineShortageInlineActions from "./OrderFulfillmentLineShortageInlineActions";
import { OrderLineResolvedShortageCallout } from "./OrderLineResolvedShortageCallout";
import { OrderLineOperationalWorkflowModule } from "./OrderLineOperationalWorkflowModule";
import type { OrderSummaryLineMenuAction, OrderSummaryProductsListLine } from "./OrderSummaryProductsList";
import { orderLineMenuLockedMessage } from "./orderLineMenuAction";
import { OrderLineEventTimeline } from "./OrderLineEventTimeline";
import {
  findResolvedShortageForOrderLine,
  isResolvedShortageReducedLine,
  isResolvedShortageRemovedLine,
  type PanelFulfillmentHistoryEntryUi,
} from "./orderLineResolvedShortage";

type OrderItemLike = {
  id: number;
  quantity: number;
  list_price?: number | null;
  unit_price?: number | null;
  unit_price_net?: number | null;
  oms_line_status?: string | null;
  from_bundle?: boolean;
  is_bundle_parent?: boolean;
  parent_bundle_order_item_id?: number | null;
  source_bundle?: { id?: number; name?: string | null; sku?: string | null } | null;
  product?: { id?: number; name?: string | null; ean?: string | null; symbol?: string | null; sku?: string | null; image_url?: string | null } | null;
  replaced_from_order_item_id?: number | null;
  replaced_from_product_name?: string | null;
};

function pickFirstFinite(...vals: (number | null | undefined)[]): number | null {
  for (const v of vals) {
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function lineArticleSurfaceClass(resolvedRemoved: boolean, resolvedReduced: boolean, isArchive: boolean): string {
  if (resolvedRemoved) {
    return "rounded-lg border border-rose-200/90 bg-rose-50/25 p-2.5 opacity-[0.9] shadow-sm";
  }
  if (resolvedReduced) {
    return "rounded-lg border border-rose-100 bg-rose-50/15 p-2.5 shadow-sm";
  }
  return `rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm ${isArchive ? "opacity-[0.92]" : ""}`;
}

function lineQtyBadgeClass(resolvedRemoved: boolean): string {
  if (resolvedRemoved) {
    return "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-300 bg-rose-100 text-sm font-extrabold tabular-nums text-rose-800";
  }
  return "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-extrabold tabular-nums text-white";
}

function ProductMetric({ label, children, alert }: { label: string; children: ReactNode; alert?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <div className={`mt-0.5 text-[13px] font-semibold tabular-nums leading-tight ${alert ? "text-red-700" : "text-slate-800"}`}>
        {children}
      </div>
    </div>
  );
}

function locationBadgeClass(storageType?: string | null): string {
  const s = (storageType ?? "").toLowerCase();
  if (s.includes("receive") || s.includes("przyj") || s.includes("inbound"))
    return "bg-blue-50 text-blue-700 border border-blue-200/60";
  if (s.includes("reserve") || s.includes("rez"))
    return "bg-amber-50 text-amber-800 border border-amber-200/60";
  return "bg-emerald-50 text-emerald-700 border border-emerald-200/60";
}

function formatExpiryPl(iso: string | null | undefined): string | null {
  const s = (iso ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function hasWarehouseLocations(wm: WmsPackingOrderLineApi | undefined): boolean {
  if (!wm) return false;
  if (wm.picked_locations?.length) return true;
  if (wm.available_stock_locations?.length) return true;
  return Boolean((wm.location_label ?? "").trim());
}

const LOCATION_PREVIEW_LIMIT = 3;

type LocChip = {
  key: string;
  label: string;
  quantity: number | null;
  className: string;
  title?: string;
  extra?: ReactNode;
};

function LocationsBadges({ wm }: { wm: WmsPackingOrderLineApi | undefined }) {
  const [expanded, setExpanded] = useState(false);

  const chips: LocChip[] = (() => {
    const picked = wm?.picked_locations;
    if (picked?.length) {
      return picked.map((loc, i) => {
        const batch = (loc.batch_number ?? "").trim();
        const exp = formatExpiryPl(loc.expiry_date);
        const qty = loc.quantity != null && Number(loc.quantity) > 0 ? Math.round(Number(loc.quantity)) : null;
        return {
          key: `${loc.location_label}-${batch}-${loc.expiry_date ?? ""}-${i}`,
          label: loc.location_label,
          quantity: qty,
          className:
            "inline-flex w-fit max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 rounded-md border border-emerald-200/60 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800",
          extra: (
            <>
              {batch ? <span className="font-mono text-[10px] opacity-80">Partia {batch}</span> : null}
              {exp ? <span className="text-[10px] opacity-80">{exp}</span> : null}
            </>
          ),
        };
      });
    }
    const slots = wm?.available_stock_locations;
    if (slots?.length) {
      return slots.map((loc, i) => ({
        key: `${loc.location_label}-${i}`,
        label: loc.location_label,
        quantity: loc.quantity != null && Number(loc.quantity) > 0 ? Math.round(Number(loc.quantity)) : null,
        className: `inline-flex w-fit max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${locationBadgeClass(loc.storage_type)}`,
        title: loc.storage_type ?? undefined,
      }));
    }
    const lab = (wm?.location_label ?? "").trim();
    if (!lab) return [];
    return [
      {
        key: lab,
        label: lab,
        quantity: wm?.location_bin_qty != null && wm.location_bin_qty > 0 ? wm.location_bin_qty : null,
        className: `inline-flex w-fit max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${locationBadgeClass(wm?.location_storage_type)}`,
      },
    ];
  })();

  if (chips.length === 0) return null;

  const hasMore = chips.length > LOCATION_PREVIEW_LIMIT;
  const visible = expanded || !hasMore ? chips : chips.slice(0, LOCATION_PREVIEW_LIMIT);
  const hiddenCount = chips.length - LOCATION_PREVIEW_LIMIT;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {visible.map((chip) => (
        <span key={chip.key} className={chip.className} title={chip.title}>
          <span className="truncate">{chip.label}</span>
          {chip.extra}
          {chip.quantity != null ? <span className="tabular-nums opacity-90">({chip.quantity})</span> : null}
        </span>
      ))}
      {hasMore ? (
        <button
          type="button"
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          aria-expanded={expanded}
          aria-label={expanded ? "Zwiń lokalizacje" : `Pokaż pozostałe lokalizacje (${hiddenCount})`}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "−" : `+${hiddenCount}`}
        </button>
      ) : null}
    </div>
  );
}

const CodeBadge = ({ label, value }: { label: string; value: string }) => (
  <span className="inline-flex items-baseline gap-1 text-[11px] text-slate-500">
    <span className="font-medium uppercase tracking-wide text-slate-400">{label}:</span>
    <span className="font-mono text-slate-700">{value}</span>
  </span>
);

function BundleSetPreviewBadge({
  components,
  wmsByItemId,
}: {
  components: OrderItemLike[];
  wmsByItemId: Map<number, WmsPackingOrderLineApi>;
}) {
  return (
    <span
      tabIndex={0}
      className="group relative inline-flex cursor-default items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-violet-400"
      aria-label="Zestaw — podgląd składników"
    >
      <Package className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
      Zestaw
      <span
        className="pointer-events-none invisible absolute left-0 top-[calc(100%+0.35rem)] z-50 w-[min(22rem,calc(100vw-2.5rem))] rounded-lg border border-slate-200/60 bg-white p-2 text-left text-[11px] font-normal normal-case opacity-0 shadow-xl ring-1 ring-slate-900/5 transition duration-150 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100"
        role="tooltip"
      >
        <p className="border-b border-slate-50 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Skład zestawu</p>
        <ul className="mt-1.5 max-h-64 space-y-2 overflow-y-auto pr-0.5">
          {components.map((c) => {
            const wm = wmsByItemId.get(c.id);
            const img = (wm?.image_url?.trim() || c.product?.image_url?.trim()) ?? null;
            const sku = (c.product?.symbol ?? c.product?.sku ?? wm?.sku ?? "").trim();
            const ean = (c.product?.ean ?? wm?.ean ?? "").trim();
            const name = (wm?.product_name?.trim() || c.product?.name?.trim() || "—") || "—";
            const q = fmtOmsQty(c.quantity);
            return (
              <li key={c.id} className="flex gap-2 rounded-md bg-white p-1.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                  {img ? <img src={img} alt="" className="h-10 w-10 object-contain" loading="lazy" /> : <span className="text-[9px] text-slate-300">—</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold leading-snug text-slate-900">{name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {sku && <CodeBadge label="SKU" value={sku} />}
                    {ean && <CodeBadge label="EAN" value={ean} />}
                  </div>
                  <p className="mt-1 text-[10px] font-medium tabular-nums text-slate-500">W zestawie: {q} szt.</p>
                </div>
              </li>
            );
          })}
        </ul>
      </span>
    </span>
  );
}

/** Jedna linia magazynowa składnika zestawu — osobny WMS, bez cen. */
function BundleComponentWarehouseRow({
  component,
  wm,
  timeline,
  logisticsLines,
}: {
  component: OrderItemLike;
  wm: WmsPackingOrderLineApi | undefined;
  timeline: WmsOrderTimelineEventApi[] | null;
  logisticsLines: string[] | null | undefined;
}) {
  const cq = Math.max(0, Number(component.quantity) || 0);
  const picked = Number(wm?.picked_quantity ?? 0);
  const packed = Number(wm?.quantity_packed ?? 0);
  const shortageUi = Number(wm?.missing_quantity ?? 0) > 1e-6;
  const img = (wm?.image_url?.trim() || component.product?.image_url?.trim()) ?? null;
  const sku = (component.product?.symbol ?? component.product?.sku ?? wm?.sku ?? "").trim();
  const ean = (component.product?.ean ?? wm?.ean ?? "").trim();
  const name = (wm?.product_name?.trim() || component.product?.name?.trim() || "—") || "—";

  return (
    <div className="rounded-md border border-slate-200/80 bg-slate-50/40 p-2">
      <div className="flex gap-2.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center">
          {img ? (
            <img src={img} alt="" className="h-11 w-11 object-contain" loading="lazy" />
          ) : (
            <span className="text-[10px] text-slate-300">—</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div>
            <p className="text-[13px] font-semibold leading-snug text-slate-900">{name}</p>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
              {sku && <CodeBadge label="SKU" value={sku} />}
              {ean && <CodeBadge label="EAN" value={ean} />}
            </div>
            <p className="mt-1 text-[11px] font-medium tabular-nums text-slate-500">
              Ilość: {fmtOmsQty(component.quantity)} szt.
            </p>
          </div>

          <div className="overflow-hidden rounded-md border border-slate-200/70 bg-white">
            <OrderLineOperationalWorkflowModule
              quantity={cq}
              pickedQuantity={picked}
              packedQuantity={packed}
              pickedQuantityFinal={wm?.picked_quantity_final ?? null}
              wmsPickingLineStatus={wm?.wms_picking_line_status ?? null}
              shortageLine={shortageUi}
              timeline={timeline}
              pickSubtitle={wm?.last_pick_audit_summary ?? null}
              packSubtitle={wm?.last_pack_audit_summary ?? null}
              logisticsLines={logisticsLines}
              locationsSlot={hasWarehouseLocations(wm) ? <LocationsBadges wm={wm} /> : undefined}
            />
          </div>

          {shortageUi ? (
            <p className="text-[10px] font-semibold text-red-800">
              Brak: {fmtOmsQty(Number(wm?.missing_quantity ?? 0))} szt.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export type OrderWarehouseProductsSectionProps = {
  lines: OrderSummaryProductsListLine[];
  orderItems: OrderItemLike[];
  wmsByItemId: Map<number, WmsPackingOrderLineApi>;
  wmsFulfillment: WmsPackingOrderCardApi | null;
  wmsLoading: boolean;
  currency: string | null | undefined;
  productEditTenantId?: number | null;
  orderId: number;
  linesTotalDisplay: string;
  itemWaitingById: Map<number, boolean>;
  onRefreshOrder: () => void;
  onRefreshWms: () => void;
  onReplaceProduct: (orderItemId: number) => void;
  onLineAction?: (action: OrderSummaryLineMenuAction, item: OrderSummaryProductsListLine["item"]) => void;
  formatMoney: (value: number | null | undefined, currency: string | null | undefined) => string;
  /** Ukrywa nagłówkowy blok sumy linii (jak „Razem brutto”) — zakładka Produkty i magazyn. */
  hideLineTotalHeader?: boolean;
  panelFulfillmentHistory?: PanelFulfillmentHistoryEntryUi[];
  formatDetailDate?: (iso: string | null | undefined) => string;
  showProductLineHistory?: boolean;
};

export function OrderWarehouseProductsSection({
  lines,
  orderItems,
  wmsByItemId,
  wmsFulfillment,
  wmsLoading,
  currency,
  productEditTenantId,
  orderId,
  linesTotalDisplay,
  itemWaitingById,
  onRefreshOrder,
  onRefreshWms,
  onReplaceProduct,
  onLineAction,
  formatMoney,
  hideLineTotalHeader = false,
  panelFulfillmentHistory = [],
  formatDetailDate = (iso) => (iso?.trim() ? iso.trim() : "—"),
  showProductLineHistory = false,
}: OrderWarehouseProductsSectionProps) {
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  const whKebabMenuKey = (slot: "mob" | "desk", itemId: number) => `${slot}-${itemId}`;

  const whKebabBtn =
    "flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors";

  const timeline = wmsFulfillment?.timeline ?? wmsFulfillment?.wms_timeline ?? null;
  const logisticsLines = wmsFulfillment?.wms_operational_logistics_lines ?? null;

  if (lines.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">Brak pozycji</p>;
  }


  return (
    <div className="space-y-2.5">
      {lines.map((row) => {
        const full = orderItems.find((x) => x.id === row.item.id);
        const wm = wmsByItemId.get(row.item.id);
        const qtyN = Number(row.item.quantity) || 0;
        const components =
          full?.is_bundle_parent === true
            ? orderItems
                .filter((x) => x.parent_bundle_order_item_id === row.item.id)
                .sort((a, b) => (a.product?.name ?? "").localeCompare(b.product?.name ?? "", "pl"))
            : [];
        const isBundleCard = Boolean(full?.is_bundle_parent && components.length > 0);

        if (isBundleCard) {
          const anyComponentShortage = components.some(
            (c) => Number(wmsByItemId.get(c.id)?.missing_quantity ?? 0) > 1e-6,
          );
          const bundleMetaSku = full?.source_bundle?.sku?.trim() || "";
          const pid = row.item.product?.id;
          const canProductLink =
            pid != null &&
            Number.isFinite(Number(pid)) &&
            Number(pid) > 0 &&
            productEditTenantId != null &&
            productEditTenantId > 0;
          const listP = full?.list_price != null && Number.isFinite(Number(full.list_price)) ? Number(full.list_price) : null;
          const unitNet = pickFirstFinite(full?.unit_price_net, full?.unit_price);
          const rabatDisplay =
            listP != null && unitNet != null && listP > unitNet + 1e-6
              ? `${formatMoney(listP - unitNet, currency)}`
              : "—";
          const ols = (full?.oms_line_status ?? "").trim().toUpperCase();
          const isArchive = qtyN <= 0 || ols === "REPLACED";
          const shortageUi = anyComponentShortage;
          const lineLockedMessage = orderLineMenuLockedMessage(full);
          const lineLocked = lineLockedMessage != null;
          const titleClass =
            "text-[15px] font-bold leading-snug text-slate-900 transition-colors hover:text-slate-700 sm:text-base";

          return (
            <article
              key={row.item.id}
              className={`rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm ${isArchive ? "opacity-[0.92]" : ""}`}
            >
              <div className="flex items-stretch gap-3">
                <div className="relative w-[4.75rem] shrink-0 self-stretch sm:w-20">
                  {row.imageUrl ? (
                    <img
                      src={row.imageUrl}
                      alt=""
                      className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-300">—</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {canProductLink ? (
                          <Link
                            to={getProductDetailsPath(pid)}
                            state={productDetailsNavState({ tenantId: productEditTenantId })}
                            className={`inline-flex items-center ${titleClass}`}
                          >
                            {row.name}
                            <ExternalLink size={13} className="ml-1.5 inline shrink-0 text-slate-400" />
                          </Link>
                        ) : (
                          <span className={titleClass}>{row.name}</span>
                        )}
                        {ols === "REPLACED" ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                            Archiwum
                          </span>
                        ) : null}
                        <BundleSetPreviewBadge components={components} wmsByItemId={wmsByItemId} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5">
                        {bundleMetaSku ? <CodeBadge label="SKU" value={bundleMetaSku} /> : null}
                        {row.ean?.trim() ? <CodeBadge label="EAN" value={row.ean.trim()} /> : null}
                        {row.catalog ? <CodeBadge label="Nr kat" value={row.catalog} /> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-start gap-4">
                      {!hideLineTotalHeader ? (
                        <div className="hidden text-right sm:block">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Wartość</p>
                          <p className="text-base font-extrabold tabular-nums text-slate-900">{row.lineGross}</p>
                        </div>
                      ) : null}
                      <div className="flex flex-col items-center">
                        <span className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">Ilość</span>
                        <span className={lineQtyBadgeClass(false)}>{row.quantityDisplay}</span>
                      </div>
                      <OrderLineKebabMenu
                        lineId={row.item.id}
                        anchorId={`order-wh-line-kebab-${row.item.id}`}
                        buttonClassName={whKebabBtn}
                        open={openMenuKey === whKebabMenuKey("desk", row.item.id)}
                        onOpenChange={(next) => setOpenMenuKey(next ? whKebabMenuKey("desk", row.item.id) : null)}
                        locked={lineLocked}
                        lockedMessage={lineLockedMessage ?? undefined}
                        onEdit={() => onLineAction?.("edit", row.item)}
                        onRabat={() => onLineAction?.("rabat", row.item)}
                        onRemove={() => onLineAction?.("remove", row.item)}
                      />
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
                    <ProductMetric label="Cena netto">{row.unitNet}</ProductMetric>
                    <ProductMetric label="Cena brutto">{row.unitGross}</ProductMetric>
                    <ProductMetric label="Rabat">{rabatDisplay}</ProductMetric>
                    <ProductMetric label="VAT">{row.vatLabel}</ProductMetric>
                    {!hideLineTotalHeader ? (
                      <ProductMetric label="Wartość">
                        <span className="font-extrabold text-slate-900">{row.lineGross}</span>
                      </ProductMetric>
                    ) : (
                      <ProductMetric label="Stan / Rez.">
                        <span className="block text-[11px] font-medium text-slate-500">per składnik</span>
                      </ProductMetric>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-2.5 rounded-md border border-violet-100 bg-violet-50/30 p-2">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
                  Zestaw zawiera
                </p>
                <div className="space-y-1.5">
                  {components.map((c) => (
                    <BundleComponentWarehouseRow
                      key={c.id}
                      component={c}
                      wm={wmsByItemId.get(c.id)}
                      timeline={timeline}
                      logisticsLines={logisticsLines}
                    />
                  ))}
                </div>
              </div>

              {shortageUi ? (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
                  Uwaga: braki dotyczą składników zestawu — rozwiązania w panelu braków poniżej pozycji.
                </div>
              ) : null}
            </article>
          );
        }

        const pid = row.item.product?.id;
        const canProductLink =
          pid != null && Number.isFinite(Number(pid)) && Number(pid) > 0 && productEditTenantId != null && productEditTenantId > 0;
        const listP = full?.list_price != null && Number.isFinite(Number(full.list_price)) ? Number(full.list_price) : null;
        const unitNet = pickFirstFinite(full?.unit_price_net, full?.unit_price);
        const rabatDisplay =
          listP != null && unitNet != null && listP > unitNet + 1e-6
            ? `${formatMoney(listP - unitNet, currency)}`
            : "—";
        const stockDisp =
          wmsLoading ? "…" : wm?.stock_quantity != null && Number.isFinite(Number(wm.stock_quantity)) ? String(wm.stock_quantity) : "—";
        const resolvedMeta = findResolvedShortageForOrderLine({
          orderItemId: row.item.id,
          productName: row.name,
          sku: row.sku,
          ean: row.ean,
          history: panelFulfillmentHistory,
          lineageMemberIds: row.lineageMemberIds,
        });
        const resolvedRemoved = isResolvedShortageRemovedLine({
          quantity: qtyN,
          resolved: resolvedMeta,
          shortageDisplayKind: wm?.shortage_display_kind,
        });
        const resolvedReduced = isResolvedShortageReducedLine({ quantity: qtyN, resolved: resolvedMeta });
        const shortageUi =
          !resolvedRemoved && !resolvedReduced && wm != null && Number(wm.missing_quantity ?? 0) > 1e-6;
        const picked = Number(wm?.picked_quantity ?? 0);
        const packed = Number(wm?.quantity_packed ?? 0);
        const ols = (full?.oms_line_status ?? "").trim().toUpperCase();
        const isArchive = !resolvedRemoved && !resolvedReduced && (qtyN <= 0 || ols === "REPLACED");
        const qtyDisplay = resolvedRemoved ? fmtOmsQty(0) : row.quantityDisplay;

        const productTitleClass = resolvedRemoved
          ? "inline-flex items-center text-[15px] font-bold leading-snug text-rose-900/80 line-through decoration-rose-300/80 sm:text-base"
          : "inline-flex items-center text-[15px] font-bold leading-snug text-slate-900 transition-colors hover:text-slate-700 sm:text-base";
        const productTitleClassPlain = resolvedRemoved
          ? "text-[15px] font-bold leading-snug text-rose-900/80 line-through decoration-rose-300/80 sm:text-base"
          : "text-[15px] font-bold leading-snug text-slate-900 sm:text-base";

        const lineLike: WmsPackingOrderLineApi =
          wm ??
          ({
            order_item_id: row.item.id,
            quantity: row.item.quantity,
            quantity_packed: 0,
            picked_quantity: 0,
            missing_quantity: 0,
            product_name: row.name,
            ean: row.ean || null,
            sku: row.sku || null,
            image_url: row.imageUrl,
            oms_line_status: row.item.oms_line_status ?? null,
            replaced_from_order_item_id: full?.replaced_from_order_item_id ?? null,
            replaced_from_product_name: full?.replaced_from_product_name ?? null,
          } as WmsPackingOrderLineApi);
        const subIn = isOmsFulfillmentSubstituteIn(lineLike);
        const oldSub = String(wm?.replaced_from_product_name ?? full?.replaced_from_product_name ?? "").trim();
        const showSubstituteBadge =
          subIn ||
          (wm?.replaced_from_order_item_id != null && wm.replaced_from_order_item_id > 0) ||
          (full?.replaced_from_order_item_id != null && full.replaced_from_order_item_id > 0);
        const lineLockedMessage = orderLineMenuLockedMessage(full, { resolvedShortageRemoved: resolvedRemoved });
        const lineLocked = lineLockedMessage != null;

        return (
          <article
            key={row.lineageRootId ?? row.item.id}
            className={lineArticleSurfaceClass(resolvedRemoved, resolvedReduced, isArchive)}
          >
            <div className="flex items-stretch gap-3">
              <div
                className={`relative w-[4.75rem] shrink-0 self-stretch sm:w-20 ${resolvedRemoved ? "opacity-50 grayscale" : ""}`}
              >
                {row.imageUrl ? (
                  <img
                    src={row.imageUrl}
                    alt=""
                    className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
                    loading="lazy"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-300">—</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {canProductLink ? (
                        <Link
                          to={getProductDetailsPath(pid)}
                          state={productDetailsNavState({ tenantId: productEditTenantId })}
                          className={productTitleClass}
                        >
                          {row.name}
                          <ExternalLink size={13} className="ml-1.5 inline shrink-0 text-slate-400" />
                        </Link>
                      ) : (
                        <span className={productTitleClassPlain}>{row.name}</span>
                      )}
                      {resolvedRemoved ? (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-800">
                          Usunięto
                        </span>
                      ) : null}
                      {resolvedReduced && !resolvedRemoved ? (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-700">
                          Zmniejszono
                        </span>
                      ) : null}
                      {ols === "REPLACED" ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                          Archiwum
                        </span>
                      ) : null}
                      {showSubstituteBadge ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-blue-800">
                          Zamiennik
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5">
                      {row.sku ? <CodeBadge label="SKU" value={row.sku} /> : null}
                      {row.ean ? <CodeBadge label="EAN" value={row.ean} /> : null}
                      {row.catalog ? <CodeBadge label="Nr kat" value={row.catalog} /> : null}
                    </div>

                    {subIn && oldSub ? (
                      <p className="mt-1.5 text-xs font-medium text-slate-800">
                        Zamiast: <span className="font-semibold">{oldSub}</span>
                      </p>
                    ) : null}
                    {(wm?.oms_line_secondary_trace ?? "").trim() && !subIn && !resolvedRemoved ? (
                      <p className="mt-1 text-xs leading-snug text-slate-500">{(wm?.oms_line_secondary_trace ?? "").trim()}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-start gap-4">
                    {!hideLineTotalHeader ? (
                      <div className="hidden text-right sm:block">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Wartość</p>
                        <p
                          className={`text-base font-extrabold tabular-nums ${
                            resolvedRemoved ? "text-rose-800/70 line-through" : "text-slate-900"
                          }`}
                        >
                          {row.lineGross}
                        </p>
                      </div>
                    ) : null}
                    <div className="flex flex-col items-center">
                      <span className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">Ilość</span>
                      <span className={lineQtyBadgeClass(resolvedRemoved)}>{qtyDisplay}</span>
                    </div>
                    <OrderLineKebabMenu
                      lineId={row.item.id}
                      anchorId={`order-wh-line-kebab-${row.item.id}`}
                      buttonClassName={whKebabBtn}
                      open={openMenuKey === whKebabMenuKey("desk", row.item.id)}
                      onOpenChange={(next) => setOpenMenuKey(next ? whKebabMenuKey("desk", row.item.id) : null)}
                      locked={lineLocked}
                      lockedMessage={lineLockedMessage ?? undefined}
                      onEdit={() => onLineAction?.("edit", row.item)}
                      onRabat={() => onLineAction?.("rabat", row.item)}
                      onRemove={() => onLineAction?.("remove", row.item)}
                    />
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
                  <ProductMetric label="Cena netto">{row.unitNet}</ProductMetric>
                  <ProductMetric label="Cena brutto">{row.unitGross}</ProductMetric>
                  <ProductMetric label="Rabat">{rabatDisplay}</ProductMetric>
                  <ProductMetric label="VAT">{row.vatLabel}</ProductMetric>
                  <ProductMetric label="Stan / Rez." alert={shortageUi}>
                    <span className="block">{stockDisp}</span>
                    <span className="mt-0.5 block text-[10px] font-medium text-slate-500">Rez.: {qtyDisplay}</span>
                  </ProductMetric>
                </div>
              </div>
            </div>

            {resolvedMeta && (resolvedRemoved || resolvedReduced) ? (
              <div className="mt-2.5">
                <OrderLineResolvedShortageCallout meta={resolvedMeta} formatDetailDate={formatDetailDate} />
              </div>
            ) : null}

            {shortageUi ? (
              <div className="mt-2.5 rounded-md border border-red-200 bg-red-50/90 px-2.5 py-2">
                <p className="text-[12px] font-bold text-red-900">
                  Zebrano {picked} / {qtyN} • Brak: {Number(wm?.missing_quantity ?? 0)}
                </p>
                <div className="mt-1.5">
                  <OrderFulfillmentLineShortageInlineActions
                    orderId={orderId}
                    orderItemId={row.item.id}
                    waiting={itemWaitingById.get(row.item.id) ?? false}
                    onRefreshOrder={onRefreshOrder}
                    onRefreshWms={onRefreshWms}
                    onReplaceProduct={onReplaceProduct}
                    productName={row.name}
                    sku={row.sku || null}
                    ean={row.ean || null}
                    orderedQuantity={qtyN}
                    missingQuantity={Number(wm?.missing_quantity ?? 0)}
                    productImageUrl={row.imageUrl}
                  />
                </div>
              </div>
            ) : null}

            {!resolvedRemoved ? (
              <div className="mt-2 overflow-hidden rounded-md border border-slate-200/80 bg-white">
                <OrderLineOperationalWorkflowModule
                  quantity={qtyN}
                  pickedQuantity={picked}
                  packedQuantity={packed}
                  pickedQuantityFinal={wm?.picked_quantity_final ?? null}
                  wmsPickingLineStatus={wm?.wms_picking_line_status ?? null}
                  shortageLine={shortageUi}
                  timeline={timeline}
                  pickSubtitle={wm?.last_pick_audit_summary ?? null}
                  packSubtitle={wm?.last_pack_audit_summary ?? null}
                  logisticsLines={logisticsLines}
                  locationsSlot={hasWarehouseLocations(wm) ? <LocationsBadges wm={wm} /> : undefined}
                />
              </div>
            ) : null}

            {showProductLineHistory && row.eventTimeline && row.eventTimeline.length > 0 ? (
              <OrderLineEventTimeline
                events={row.eventTimeline}
                formatDetailDate={(iso) => formatDetailDate(iso)}
                defaultOpen
              />
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
