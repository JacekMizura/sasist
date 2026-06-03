import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Package, ExternalLink } from "lucide-react";

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
    return "rounded-xl border border-rose-200 bg-rose-50/40 p-4 shadow-sm";
  }
  if (resolvedReduced) {
    return "rounded-xl border border-rose-100 bg-rose-50/20 p-4 shadow-sm";
  }
  return `rounded-xl border border-slate-100 bg-white p-4 shadow-sm ${
    isArchive ? "opacity-[0.92]" : ""
  }`;
}

function lineQtyBadgeClass(resolvedRemoved: boolean): string {
  if (resolvedRemoved) {
    return "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-rose-300 bg-rose-100 text-[15px] font-extrabold tabular-nums text-rose-950";
  }
  return "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-[15px] font-extrabold tabular-nums text-white shadow-sm";
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

function LocationsBadges({ wm }: { wm: WmsPackingOrderLineApi | undefined }) {
  const picked = wm?.picked_locations;
  if (picked?.length) {
    return (
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {picked.map((loc, i) => {
          const batch = (loc.batch_number ?? "").trim();
          const exp = formatExpiryPl(loc.expiry_date);
          return (
            <span
              key={`${loc.location_label}-${batch}-${loc.expiry_date ?? ""}-${i}`}
              className="inline-flex w-fit max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md px-1.5 py-0.5 border border-emerald-200/60 bg-emerald-50 text-[11px] font-medium text-emerald-800"
            >
              <span className="truncate">{loc.location_label}</span>
              {batch ? <span className="font-mono text-[10px] opacity-80">Partia {batch}</span> : null}
              {exp ? <span className="text-[10px] opacity-80">{exp}</span> : null}
              {loc.quantity != null && Number(loc.quantity) > 0 ? (
                <span className="tabular-nums opacity-90">{Math.round(Number(loc.quantity))}</span>
              ) : null}
            </span>
          );
        })}
      </div>
    );
  }
  const slots = wm?.available_stock_locations;
  if (slots?.length) {
    return (
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {slots.map((loc, i) => (
          <span
            key={`${loc.location_label}-${i}`}
            className={`inline-flex w-fit max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${locationBadgeClass(loc.storage_type)}`}
            title={loc.storage_type ?? undefined}
          >
            <span className="truncate">{loc.location_label}</span>
            {loc.quantity != null && Number(loc.quantity) > 0 ? (
              <span className="tabular-nums opacity-90">{Math.round(Number(loc.quantity))}</span>
            ) : null}
          </span>
        ))}
      </div>
    );
  }
  const lab = (wm?.location_label ?? "").trim();
  if (!lab) return null;
  return (
    <span
      className={`inline-flex w-fit max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${locationBadgeClass(wm?.location_storage_type)}`}
    >
      {lab}
      {wm?.location_bin_qty != null && wm.location_bin_qty > 0 ? (
        <span className="tabular-nums opacity-90">({wm.location_bin_qty})</span>
      ) : null}
    </span>
  );
}

const CodeBadge = ({ label, value }: { label: string; value: string }) => (
  <span className="inline-flex items-center gap-1 rounded bg-slate-100/80 px-1.5 py-0.5 text-[10px] border border-slate-200/60 shadow-sm">
    <span className="font-medium text-slate-400">{label}</span>
    <span className="font-mono font-medium text-slate-700">{value}</span>
  </span>
);

const WH_METRIC_L = "text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap text-left lg:text-right";
const WH_METRIC_V = "mt-1 text-[13px] font-semibold tabular-nums text-slate-800 whitespace-nowrap text-left lg:text-right leading-tight";

function WarehouseMetricCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className={WH_METRIC_L}>{label}</p>
      <div className={WH_METRIC_V}>{children}</div>
    </div>
  );
}

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
        className="pointer-events-none invisible absolute left-0 top-[calc(100%+0.35rem)] z-50 w-[min(22rem,calc(100vw-2.5rem))] rounded-lg border border-slate-100 bg-white p-2 text-left text-[11px] font-normal normal-case opacity-0 shadow-xl ring-1 ring-slate-900/5 transition duration-150 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100"
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
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-slate-200/70 bg-white shadow-sm">
                  {img ? <img src={img} alt="" className="max-h-10 max-w-10 object-contain drop-shadow-sm" loading="lazy" /> : <span className="text-[9px] text-slate-300">—</span>}
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
    <div className="ml-4 rounded-r-lg border-l-2 border-violet-200 bg-white py-2 pl-3 pr-2 sm:ml-6">
      <div className="flex gap-2.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center">
          {img ? (
            <img src={img} alt="" className="max-h-12 max-w-12 object-contain drop-shadow-sm" loading="lazy" />
          ) : (
            <span className="text-[10px] text-slate-300">—</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-[13px] font-semibold leading-snug text-slate-900">{name}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {sku && <CodeBadge label="SKU" value={sku} />}
              {ean && <CodeBadge label="EAN" value={ean} />}
            </div>
            
            <div className="mt-2">
              <LocationsBadges wm={wm} />
            </div>

            <p className="mt-2 text-[11px] font-medium tabular-nums text-slate-500">
              Do pobrania: {fmtOmsQty(component.quantity)} szt.
            </p>
          </div>

          <div className="overflow-hidden rounded-md border border-slate-100 bg-white">
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
            />
          </div>

          {shortageUi ? (
            <p className="text-[10px] font-semibold text-red-800">
              Brak: {fmtOmsQty(Number(wm?.missing_quantity ?? 0))} szt. ·{" "}
              <a href="#wms-braki-sekcja" className="underline underline-offset-2">
                szczegóły braków
              </a>
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

  // Siatka uwzględniająca to, czy "Wartość" jest ukryta (hideLineTotalHeader) 
  const desktopGridClass = hideLineTotalHeader
    ? "mt-2 hidden items-start gap-x-4 lg:grid lg:grid-cols-[minmax(0,1fr)_3rem_4.5rem_4.5rem_3.5rem_4rem_5.5rem_2rem]"
    : "mt-2 hidden items-start gap-x-4 lg:grid lg:grid-cols-[minmax(0,1fr)_3rem_4.5rem_4.5rem_3.5rem_4rem_5rem_5.5rem_2rem]";

  return (
    <div className="space-y-4">
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
          const bundleMeta = [
            full?.source_bundle?.sku?.trim() ? `SKU ${full.source_bundle.sku.trim()}` : "",
            row.ean?.trim() ? `EAN ${row.ean.trim()}` : "",
          ]
            .filter(Boolean)
            .join(" · ");
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

          return (
            <article
              key={row.item.id}
              className={`rounded-xl border border-slate-100 bg-white p-4 shadow-sm ${
                isArchive ? "opacity-[0.92]" : ""
              }`}
            >
              <div className="flex flex-wrap items-start gap-3 lg:hidden">
                <span className={lineQtyBadgeClass(false)}>
                  {row.quantityDisplay}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex min-w-0 flex-1 gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center">
                        {row.imageUrl ? (
                          <img src={row.imageUrl} alt="" className="max-h-16 max-w-16 object-contain drop-shadow-sm" loading="lazy" />
                        ) : (
                          <span className="text-[11px] text-slate-300">—</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {canProductLink ? (
                            <Link
                              to={`/products/${pid}/edit`}
                              state={{ tenantId: productEditTenantId }}
                              className="text-[15px] font-semibold leading-snug text-slate-900 hover:text-slate-700 flex items-center transition-colors"
                            >
                              {row.name} <ExternalLink size={14} className="ml-1.5 inline text-slate-400" />
                            </Link>
                          ) : (
                            <span className="text-[15px] font-semibold leading-snug text-slate-900">{row.name}</span>
                          )}
                          {ols === "REPLACED" ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                              Archiwum
                            </span>
                          ) : null}
                          <BundleSetPreviewBadge components={components} wmsByItemId={wmsByItemId} />
                        </div>
                        <p className="mt-1 text-[12px] text-slate-500">
                          Składa się z {components.length}{" "}
                          {components.length === 1 ? "produktu" : "produktów"}
                        </p>
                        {bundleMeta ? <p className="mt-1 text-[12px] leading-snug text-slate-500">{bundleMeta}</p> : null}
                      </div>
                    </div>
                    {!hideLineTotalHeader ? (
                      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                        <p className="text-lg font-extrabold tabular-nums text-slate-900">{row.lineGross}</p>
                        <p className="text-[12px] tabular-nums text-slate-500">
                          {row.quantityDisplay} szt. × {row.unitGross}
                        </p>
                      </div>
                    ) : null}
                    <OrderLineKebabMenu
                      lineId={row.item.id}
                      anchorId={`order-wh-line-kebab-mob-${row.item.id}`}
                      buttonClassName={whKebabBtn}
                      open={openMenuKey === whKebabMenuKey("mob", row.item.id)}
                      onOpenChange={(next) => setOpenMenuKey(next ? whKebabMenuKey("mob", row.item.id) : null)}
                      locked={lineLocked}
                      lockedMessage={lineLockedMessage ?? undefined}
                      onEdit={() => onLineAction?.("edit", row.item)}
                      onRabat={() => onLineAction?.("rabat", row.item)}
                      onRemove={() => onLineAction?.("remove", row.item)}
                    />
                  </div>
                </div>
              </div>

              <div className={desktopGridClass}>
                <div className="min-w-0 pr-2">
                  <div className="flex gap-4">
                    <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center">
                      {row.imageUrl ? (
                        <img src={row.imageUrl} alt="" className="max-h-[72px] max-w-[72px] object-contain drop-shadow-sm" loading="lazy" />
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {canProductLink ? (
                          <Link
                            to={`/products/${pid}/edit`}
                            state={{ tenantId: productEditTenantId }}
                            className="text-[15px] font-semibold leading-snug text-slate-900 hover:text-slate-700 flex items-center transition-colors"
                          >
                            {row.name} <ExternalLink size={14} className="ml-1.5 inline text-slate-400" />
                          </Link>
                        ) : (
                          <span className="text-[15px] font-semibold leading-snug text-slate-900">{row.name}</span>
                        )}
                        {ols === "REPLACED" ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                            Archiwum
                          </span>
                        ) : null}
                        <BundleSetPreviewBadge components={components} wmsByItemId={wmsByItemId} />
                      </div>
                      <p className="mt-1 text-[12px] text-slate-500">
                        Składa się z {components.length} {components.length === 1 ? "produktu" : "produktów"}
                      </p>
                      {bundleMeta ? <p className="mt-1 text-[12px] leading-snug text-slate-500">{bundleMeta}</p> : null}
                    </div>
                  </div>
                </div>
                <div className="flex justify-center pt-0.5">
                  <span className={lineQtyBadgeClass(false)}>
                    {row.quantityDisplay}
                  </span>
                </div>
                <WarehouseMetricCell label="Netto/szt">{row.unitNet}</WarehouseMetricCell>
                <WarehouseMetricCell label="Brutto/szt">{row.unitGross}</WarehouseMetricCell>
                <WarehouseMetricCell label="VAT">{row.vatLabel}</WarehouseMetricCell>
                <WarehouseMetricCell label="Rabat">{rabatDisplay}</WarehouseMetricCell>
                {hideLineTotalHeader ? null : (
                  <WarehouseMetricCell label="Wartość">
                    <span className="font-extrabold text-slate-900">{row.lineGross}</span>
                  </WarehouseMetricCell>
                )}
                <WarehouseMetricCell label="Stan / Rez.">
                  <span className="block font-semibold text-slate-800">—</span>
                  <span className="block text-[11px] font-medium text-slate-500 mt-0.5">per składnik</span>
                </WarehouseMetricCell>
                <div className="flex justify-end pt-0.5">
                  <OrderLineKebabMenu
                    lineId={row.item.id}
                    anchorId={`order-wh-line-kebab-desk-${row.item.id}`}
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

              <div className="mt-4 grid grid-cols-2 gap-3 pt-3 sm:grid-cols-3 lg:hidden">
                <WarehouseMetricCell label="Ilość">{row.quantityDisplay}</WarehouseMetricCell>
                <WarehouseMetricCell label="Netto/szt">{row.unitNet}</WarehouseMetricCell>
                <WarehouseMetricCell label="Brutto/szt">{row.unitGross}</WarehouseMetricCell>
                <WarehouseMetricCell label="VAT">{row.vatLabel}</WarehouseMetricCell>
                <WarehouseMetricCell label="Rabat">{rabatDisplay}</WarehouseMetricCell>
                {hideLineTotalHeader ? null : (
                  <WarehouseMetricCell label="Wartość">
                    <span className="font-extrabold">{row.lineGross}</span>
                  </WarehouseMetricCell>
                )}
                <WarehouseMetricCell label="Stan mag.">
                  <span className="block">—</span>
                  <span className="block text-[9px] font-normal leading-tight text-slate-400 mt-0.5">per składnik</span>
                </WarehouseMetricCell>
                <WarehouseMetricCell label="Rezerwacja">{row.quantityDisplay}</WarehouseMetricCell>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-violet-700">
                  Składniki do zebrania
                </p>
                <div className="space-y-3">
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
                <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800 border border-amber-100">
                  Uwaga: braki dotyczą składników zestawu — rozwiązania w{" "}
                  <a href="#wms-braki-sekcja" className="font-semibold underline underline-offset-2 hover:text-amber-900">
                    sekcji braków
                  </a>
                  .
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
          ? "text-[15px] font-semibold leading-snug text-rose-900/80 line-through decoration-rose-300/80 flex items-center"
          : "text-[15px] font-semibold leading-snug text-slate-900 hover:text-slate-700 flex items-center transition-colors";
        const productTitleClassPlain = resolvedRemoved
          ? "text-[15px] font-semibold leading-snug text-rose-900/80 line-through decoration-rose-300/80"
          : "text-[15px] font-semibold leading-snug text-slate-900";
          
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
            <div className="flex flex-wrap items-start gap-3 lg:hidden">
              <span className={lineQtyBadgeClass(resolvedRemoved)}>{qtyDisplay}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex min-w-0 flex-1 gap-4">
                    <div
                      className={`flex h-[72px] w-[72px] shrink-0 items-center justify-center ${resolvedRemoved ? "opacity-50 grayscale" : ""}`}
                    >
                      {row.imageUrl ? (
                        <img src={row.imageUrl} alt="" className="max-h-[72px] max-w-[72px] object-contain drop-shadow-sm" loading="lazy" />
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {canProductLink ? (
                          <Link
                            to={`/products/${pid}/edit`}
                            state={{ tenantId: productEditTenantId }}
                            className={productTitleClass}
                          >
                            {row.name} <ExternalLink size={14} className="ml-1.5 inline text-slate-400" />
                          </Link>
                        ) : (
                          <span className={productTitleClassPlain}>{row.name}</span>
                        )}
                        {resolvedRemoved && resolvedMeta ? (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-800">
                            USUNIĘTO PRZEZ BRAK MAGAZYNOWY
                          </span>
                        ) : null}
                        {resolvedReduced && resolvedMeta && !resolvedRemoved ? (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-700">
                            ZMNIEJSZONO (BRAK)
                          </span>
                        ) : null}
                        {ols === "REPLACED" ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                            Archiwum
                          </span>
                        ) : null}
                        {showSubstituteBadge ? (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-blue-800">
                            Produkt zastępczy
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {row.sku && <CodeBadge label="SKU" value={row.sku} />}
                        {row.ean && <CodeBadge label="EAN" value={row.ean} />}
                        {row.catalog && <CodeBadge label="NR" value={row.catalog} />}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <LocationsBadges wm={wm} />
                      </div>

                      {resolvedMeta && (resolvedRemoved || resolvedReduced) ? (
                        <div className="mt-2">
                          <OrderLineResolvedShortageCallout meta={resolvedMeta} formatDetailDate={formatDetailDate} compact />
                        </div>
                      ) : null}
                      {subIn && oldSub ? (
                        <p className="mt-2 text-xs text-slate-500">
                          Zamiast: <span className="font-medium text-slate-700">{oldSub}</span>
                        </p>
                      ) : null}
                      {(wm?.oms_line_secondary_trace ?? "").trim() && !subIn && !resolvedRemoved ? (
                        <p className="mt-2 text-xs leading-snug text-slate-500">{(wm?.oms_line_secondary_trace ?? "").trim()}</p>
                      ) : null}
                    </div>
                  </div>
                  {!hideLineTotalHeader ? (
                    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                      <p className={`text-lg font-extrabold tabular-nums ${resolvedRemoved ? "text-rose-800/70 line-through" : "text-slate-900"}`}>
                        {row.lineGross}
                      </p>
                      <p className="text-[12px] tabular-nums text-slate-500">
                        {qtyDisplay} szt. × {row.unitGross}
                      </p>
                    </div>
                  ) : null}
                  <OrderLineKebabMenu
                    lineId={row.item.id}
                    anchorId={`order-wh-line-kebab-mob-${row.item.id}`}
                    buttonClassName={whKebabBtn}
                    open={openMenuKey === whKebabMenuKey("mob", row.item.id)}
                    onOpenChange={(next) => setOpenMenuKey(next ? whKebabMenuKey("mob", row.item.id) : null)}
                    locked={lineLocked}
                    lockedMessage={lineLockedMessage ?? undefined}
                    onEdit={() => onLineAction?.("edit", row.item)}
                    onRabat={() => onLineAction?.("rabat", row.item)}
                    onRemove={() => onLineAction?.("remove", row.item)}
                  />
                </div>
              </div>
            </div>
            <div className={desktopGridClass}>
              <div
                className={`group relative max-w-[980px] overflow-hidden rounded-[22px] border transition-all duration-200 ${
                  resolvedRemoved
                    ? "border-rose-200 bg-rose-50/40"
                    : resolvedReduced
                      ? "border-amber-200 bg-amber-50/30"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
                }`}
              >
                <div className="p-6">
                  <div className="max-w-[1100px]">
                  </div>
                  {/* HEADER */}
                  <div className="flex items-start gap-5">
                    {/* IMAGE */}
                    <div
                      className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-slate-100 bg-white ${
                        resolvedRemoved ? "opacity-50 grayscale" : ""
                      }`}
                    >
                      {row.imageUrl ? (
                        <img
                          src={row.imageUrl}
                          alt=""
                          className="max-h-20 max-w-20 object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </div>

                    {/* CENTER */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-6">
                        {/* LEFT */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {canProductLink ? (
                              <Link
                                to={`/products/${pid}/edit`}
                                state={{ tenantId: productEditTenantId }}
                                className={productTitleClass}
                              >
                                {row.name}

                                <ExternalLink
                                  size={14}
                                  className="ml-1.5 inline text-slate-400"
                                />
                              </Link>
                            ) : (
                              <span className={productTitleClassPlain}>
                                {row.name}
                              </span>
                            )}

                            {resolvedRemoved && resolvedMeta ? (
                              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                                Usunięto
                              </span>
                            ) : null}

                            {resolvedReduced && resolvedMeta && !resolvedRemoved ? (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                                Zmniejszono
                              </span>
                            ) : null}

                            {ols === "REPLACED" ? (
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                                Archiwum
                              </span>
                            ) : null}

                            {showSubstituteBadge ? (
                              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-800">
                                Zamiennik
                              </span>
                            ) : null}
                          </div>

                          {/* CODES */}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {row.sku && <CodeBadge label="SKU" value={row.sku} />}
                            {row.ean && <CodeBadge label="EAN" value={row.ean} />}
                            {row.catalog && (
                              <CodeBadge label="NR" value={row.catalog} />
                            )}
                          </div>

                          {/* LOCATIONS */}
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <LocationsBadges wm={wm} />
                          </div>

                          {/* TRACE */}
                          {subIn && oldSub ? (
                            <p className="mt-3 text-xs text-slate-500">
                              Zamiast:
                              <span className="ml-1 font-medium text-slate-700">
                                {oldSub}
                              </span>
                            </p>
                          ) : null}

                          {(wm?.oms_line_secondary_trace ?? "").trim() &&
                          !subIn &&
                          !resolvedRemoved ? (
                            <p className="mt-3 text-xs leading-snug text-slate-500">
                              {(wm?.oms_line_secondary_trace ?? "").trim()}
                            </p>
                          ) : null}
                        </div>

                        {/* RIGHT */}
                        <div className="flex items-start gap-4">
                          <div className="flex flex-col items-end">
                            <span
                              className={`flex h-11 min-w-[46px] items-center justify-center rounded-2xl px-3 text-[17px] font-black tabular-nums shadow-sm ${
                                resolvedRemoved
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-amber-500 text-white"
                              }`}
                            >
                              {qtyDisplay}
                            </span>

                            {!hideLineTotalHeader ? (
                              <div className="mt-3 text-right">
                                <p
                                  className={`text-[28px] font-black leading-none tabular-nums ${
                                    resolvedRemoved
                                      ? "text-rose-700/70 line-through"
                                      : "text-slate-900"
                                  }`}
                                >
                                  {row.lineGross}
                                </p>

                                <p className="mt-1 text-xs text-slate-500">
                                  {qtyDisplay} × {row.unitGross}
                                </p>
                              </div>
                            ) : null}
                          </div>

                          <OrderLineKebabMenu
                            lineId={row.item.id}
                            anchorId={`order-wh-line-kebab-desk-${row.item.id}`}
                            buttonClassName="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                            open={
                              openMenuKey ===
                              whKebabMenuKey("desk", row.item.id)
                            }
                            onOpenChange={(next) =>
                              setOpenMenuKey(
                                next
                                  ? whKebabMenuKey("desk", row.item.id)
                                  : null,
                              )
                            }
                            locked={lineLocked}
                            lockedMessage={lineLockedMessage ?? undefined}
                            onEdit={() => onLineAction?.("edit", row.item)}
                            onRabat={() => onLineAction?.("rabat", row.item)}
                            onRemove={() => onLineAction?.("remove", row.item)}
                          />
                        </div>
                      </div>

                      {/* METRICS */}
                      <div className="mt-5 grid grid-cols-5 gap-3">
                        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Netto
                          </p>

                          <p className="mt-1 text-sm font-bold text-slate-900">
                            {row.unitNet}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Brutto
                          </p>

                          <p className="mt-1 text-sm font-bold text-slate-900">
                            {row.unitGross}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            VAT
                          </p>

                          <p className="mt-1 text-sm font-bold text-slate-900">
                            {row.vatLabel}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Rabat
                          </p>

                          <p className="mt-1 text-sm font-bold text-slate-900">
                            {rabatDisplay}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Stan / Rez.
                          </p>

                          <p className="mt-1 text-sm font-bold text-slate-900">
                            {stockDisp}
                          </p>

                          <p className="mt-1 text-[11px] text-slate-500">
                            Rez.: {qtyDisplay}
                          </p>
                        </div>
                      </div>

                      {/* SHORTAGE */}
                      {shortageUi ? (
                        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
                          <p className="text-sm font-bold text-red-900">
                            Zebrano {picked} / {qtyN} · Brak:{" "}
                            {Number(wm?.missing_quantity ?? 0)}
                          </p>

                          <div className="mt-3">
                            <OrderFulfillmentLineShortageInlineActions
                              orderId={orderId}
                              orderItemId={row.item.id}
                              waiting={
                                itemWaitingById.get(row.item.id) ?? false
                              }
                              onRefreshOrder={onRefreshOrder}
                              onRefreshWms={onRefreshWms}
                              onReplaceProduct={onReplaceProduct}
                              productName={row.name}
                              sku={row.sku || null}
                              ean={row.ean || null}
                              orderedQuantity={qtyN}
                              missingQuantity={Number(
                                wm?.missing_quantity ?? 0,
                              )}
                              productImageUrl={row.imageUrl}
                            />
                          </div>
                        </div>
                      ) : null}

                      {/* RESOLVED */}
                      {resolvedMeta &&
                      (resolvedRemoved || resolvedReduced) ? (
                        <div className="mt-5">
                          <OrderLineResolvedShortageCallout
                            meta={resolvedMeta}
                            formatDetailDate={formatDetailDate}
                          />
                        </div>
                      ) : null}

                      {/* WORKFLOW */}
                      {!resolvedRemoved ? (
                        <div className="mt-6 -ml-[116px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
                          <OrderLineOperationalWorkflowModule
                            quantity={qtyN}
                            pickedQuantity={picked}
                            packedQuantity={packed}
                            pickedQuantityFinal={
                              wm?.picked_quantity_final ?? null
                            }
                            wmsPickingLineStatus={
                              wm?.wms_picking_line_status ?? null
                            }
                            shortageLine={shortageUi}
                            timeline={timeline}
                            pickSubtitle={
                              wm?.last_pick_audit_summary ?? null
                            }
                            packSubtitle={
                              wm?.last_pack_audit_summary ?? null
                            }
                            logisticsLines={logisticsLines}
                          />
                        </div>
                      ) : (
                        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
                          <p className="text-sm font-medium text-rose-800">
                            Pozycja usunięta z kompletacji z powodu braków
                            magazynowych.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            

            <div className="mt-4 grid grid-cols-2 gap-3 pt-3 sm:grid-cols-3 lg:hidden">
              <WarehouseMetricCell label="Ilość">{qtyDisplay}</WarehouseMetricCell>
              <WarehouseMetricCell label="Netto/szt">{row.unitNet}</WarehouseMetricCell>
              <WarehouseMetricCell label="Brutto/szt">{row.unitGross}</WarehouseMetricCell>
              <WarehouseMetricCell label="VAT">{row.vatLabel}</WarehouseMetricCell>
              <WarehouseMetricCell label="Rabat">{rabatDisplay}</WarehouseMetricCell>
              {hideLineTotalHeader ? null : (
                <WarehouseMetricCell label="Wartość">
                  <span className="font-extrabold">{row.lineGross}</span>
                </WarehouseMetricCell>
              )}
              <WarehouseMetricCell label="Stan mag.">
                <span className="block">{stockDisp}</span>
                <span className="block text-[9px] font-normal leading-tight text-slate-400 mt-0.5">per składnik</span>
              </WarehouseMetricCell>
              <WarehouseMetricCell label="Rezerwacja">{qtyDisplay}</WarehouseMetricCell>
            </div>

            {shortageUi ? (
              <div className="mt-4 rounded-lg border border-red-100 bg-red-50/60 px-4 py-3">
                <p className="text-[12px] font-semibold text-red-900">
                  Zebrano {picked} / {qtyN} · Brak: {Number(wm?.missing_quantity ?? 0)}
                </p>
                <div className="mt-2">
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
                  <a
                    href="#wms-braki-sekcja"
                    className="mt-2 inline-block text-[11px] font-medium text-red-700 hover:text-red-900 transition-colors"
                  >
                    Pełna sekcja braków ↓
                  </a>
                </div>
              </div>
            ) : null}

            {resolvedRemoved ? (
              <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-[12px] font-medium text-rose-800">
                Pozycja wyłączona z kompletacji i pakowania — usunięta podczas obsługi braków magazynowych.
              </p>
            ) : (
              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200/70 bg-white">
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
                />
              </div>
            )}

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