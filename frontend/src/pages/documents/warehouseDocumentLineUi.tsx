import { useState } from "react";
import type { StockDocumentItemRead } from "../../api/stockDocumentsApi";
import { HoverPopover } from "../../components/ui/HoverPopover";
import { LocationBadge } from "../../components/warehouse/LocationBadge";

const lineTypePill =
  "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1";

const statusPill =
  "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1";

export function warehouseLineTypeAbbrev(t: string | null | undefined): string {
  const key = (t || "").trim().toLowerCase();
  switch (key) {
    case "product":
      return "LP";
    case "service":
      return "USŁ";
    case "bundle":
    case "set":
    case "zestaw":
      return "ZESTAW";
    case "carton":
      return "KART";
    case "packaging_material":
      return "MAT";
    default:
      return key ? key.slice(0, 4).toUpperCase() : "—";
  }
}

export function warehouseLineTypeBadgeClass(t: string | null | undefined): string {
  const key = (t || "").trim().toLowerCase();
  switch (key) {
    case "product":
      return "bg-slate-50 text-slate-700 ring-slate-200/80";
    case "service":
      return "bg-violet-50 text-violet-800 ring-violet-200/80";
    case "bundle":
    case "set":
    case "zestaw":
      return "bg-indigo-50 text-indigo-800 ring-indigo-200/80";
    case "carton":
      return "bg-amber-50 text-amber-900 ring-amber-200/80";
    case "packaging_material":
      return "bg-sky-50 text-sky-800 ring-sky-200/80";
    default:
      return "bg-slate-50 text-slate-600 ring-slate-200/80";
  }
}

export function WarehouseLineTypeBadge({ type }: { type: string | null | undefined }) {
  const abbr = warehouseLineTypeAbbrev(type);
  if (abbr === "—") return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className={`${lineTypePill} ${warehouseLineTypeBadgeClass(type)}`} title={type ?? undefined}>
      {abbr}
    </span>
  );
}

export function receiptLineDisplayName(it: StockDocumentItemRead): string {
  const n = (it.product_name || "").trim();
  if (n) return n;
  if (it.product_id != null) return `Produkt #${it.product_id}`;
  return "Pozycja";
}

export type ReceiptLinePlacementRow = {
  locationCode: string;
  locationType: string;
  quantity: number;
  /** True when qty is still on receiving dock (not yet put away). */
  isDockRemaining?: boolean;
};

const PLACEMENT_EPS = 1e-6;

function fmtPlacementQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 6 }).format(n);
}

/** Putaway remaining on line — prefer API computed field, else received − putaway. */
export function receiptLinePutawayRemaining(it: StockDocumentItemRead): number {
  const fromApi = it.putaway_remaining;
  if (fromApi != null && Number.isFinite(Number(fromApi))) {
    return Math.max(0, Number(fromApi));
  }
  return Math.max(0, (Number(it.received_quantity) || 0) - (Number(it.quantity_putaway) || 0));
}

/**
 * PZ line placement for document table: destination PUTAWAY allocations (provenance)
 * plus remaining DOCK-IN qty. Never invents locations from live Inventory.
 */
export function receiptLinePlacementRows(
  it: StockDocumentItemRead,
  dockLocationCode?: string | null,
): ReceiptLinePlacementRow[] {
  const rows: ReceiptLinePlacementRow[] = [];
  for (const a of it.putaway_allocations ?? []) {
    const code = (a.location_code || a.location_name || "").trim();
    const qty = Number(a.quantity) || 0;
    if (!code || qty <= PLACEMENT_EPS) continue;
    rows.push({
      locationCode: code,
      locationType: (a.location_type || "PICK").trim() || "PICK",
      quantity: qty,
    });
  }
  rows.sort((a, b) => b.quantity - a.quantity || a.locationCode.localeCompare(b.locationCode, "pl"));

  const rem = receiptLinePutawayRemaining(it);
  if (rem > PLACEMENT_EPS) {
    const dock = (dockLocationCode || "DOCK-IN").trim() || "DOCK-IN";
    const dockKey = dock.toLowerCase();
    const already = rows.find((r) => r.locationCode.toLowerCase() === dockKey);
    if (already) {
      already.quantity += rem;
      already.isDockRemaining = true;
      already.locationType = "INBOUND";
    } else {
      rows.push({
        locationCode: dock,
        locationType: "INBOUND",
        quantity: rem,
        isDockRemaining: true,
      });
    }
  }
  return rows;
}

/** Compact label for legacy single-string callers (prefer placement rows in UI). */
export function receiptLineLocationCode(
  it: StockDocumentItemRead,
  dockLocationCode?: string | null,
): string | null {
  const rows = receiptLinePlacementRows(it, dockLocationCode);
  if (!rows.length) return null;
  if (rows.length === 1) {
    return `${rows[0]!.locationCode} · ${fmtPlacementQty(rows[0]!.quantity)} szt.`;
  }
  return `${rows[0]!.locationCode} · ${fmtPlacementQty(rows[0]!.quantity)} szt.  +${rows.length - 1} lokalizacje`;
}

export function wzLineLocationCode(it: StockDocumentItemRead): string | null {
  const mm = (it.mm_line_from_location_name || "").trim();
  if (mm) return mm;
  const last = (it.putaway_last_location_name || "").trim();
  if (last) return last;
  const a = it.putaway_allocations ?? [];
  const first = (a[0]?.location_code || a[0]?.location_name || "").trim();
  return first || null;
}

export function receiptLineStatusKey(it: StockDocumentItemRead): "delivered" | "in_progress" | "pending" | "none" {
  const o = Number(it.ordered_quantity) || 0;
  const r = Number(it.received_quantity) || 0;
  if (o <= 1e-9) return "none";
  if (r + 1e-6 >= o) return "delivered";
  if (r > 1e-6) return "in_progress";
  return "pending";
}

export function receiptLineStatusLabel(it: StockDocumentItemRead): string {
  switch (receiptLineStatusKey(it)) {
    case "delivered":
      return "Dostarczono";
    case "in_progress":
      return "W realizacji";
    case "pending":
      return "Oczekuje";
    default:
      return "—";
  }
}

const QTY_EPS = 1e-6;

/** Linia PZ z różnicą dostawy: zamówiono więcej niż przyjęto. */
export function hasDeliveryQuantityDiff(ordered: number, received: number): boolean {
  return ordered > QTY_EPS && received + QTY_EPS < ordered;
}

/** Brak dostawy (zamówiono − przyjęto), nieujemny. */
export function deliveryShortageQty(ordered: number, received: number): number {
  if (!hasDeliveryQuantityDiff(ordered, received)) return 0;
  return Math.max(0, ordered - received);
}

export function deliveryDifferenceAcceptedLabel(received: number): string {
  return received <= QTY_EPS ? "Niedobór zaakceptowany" : "Różnica zaakceptowana";
}

export function DeliveryDifferenceAcceptedBadge({ received }: { received: number }) {
  const label = deliveryDifferenceAcceptedLabel(received);
  return (
    <span
      className={`${statusPill} bg-violet-50 text-violet-900 ring-violet-200/90`}
      title="Decyzja zapisana lokalnie w tej sesji — nie zmienia danych magazynowych"
    >
      {label}
    </span>
  );
}

export function wzLineStatusLabel(it: StockDocumentItemRead): string {
  const q = Number(it.quantity) || Number(it.ordered_quantity) || 0;
  if (q > 1e-6) return "Wydano";
  return "—";
}

function lineStatusBadgeClass(status: string): string {
  switch (status) {
    case "Dostarczono":
    case "Wydano":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200/90";
    case "W realizacji":
      return "bg-amber-50 text-amber-900 ring-amber-200/90";
    case "Oczekuje":
      return "bg-slate-100 text-slate-600 ring-slate-200/90";
    default:
      return "bg-slate-100 text-slate-500 ring-slate-200/90";
  }
}

export function WarehouseLineStatusBadge({ label }: { label: string }) {
  if (label === "—") return <span className="text-xs text-slate-400">—</span>;
  return <span className={`${statusPill} ${lineStatusBadgeClass(label)}`}>{label}</span>;
}

export function WarehouseLineLocationCell({
  it,
  isWz,
  dockLocationCode,
}: {
  it: StockDocumentItemRead;
  isWz: boolean;
  /** Document receiving location (usually DOCK-IN) for remainder qty. */
  dockLocationCode?: string | null;
}) {
  if (isWz) {
    const code = wzLineLocationCode(it);
    if (!code) return <span className="text-xs text-slate-400">—</span>;
    const locType = (it.putaway_last_location_type || "PICK").trim() || "PICK";
    return <LocationBadge code={code} type={locType} className="max-w-[10rem]" />;
  }

  const rows = receiptLinePlacementRows(it, dockLocationCode);
  if (!rows.length) return <span className="text-xs text-slate-400">—</span>;

  if (rows.length === 1) {
    const r = rows[0]!;
    return (
      <LocationBadge
        code={r.locationCode}
        type={r.locationType}
        quantity={r.quantity}
        className="max-w-[12rem]"
      />
    );
  }

  const first = rows[0]!;
  const extra = rows.length - 1;
  const total = rows.reduce((s, r) => s + r.quantity, 0);
  const popover = (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Rozlokowanie</p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li
            key={`${r.locationCode}-${r.isDockRemaining ? "dock" : "put"}`}
            className="flex items-baseline justify-between gap-6"
          >
            <span className="font-mono text-[12px] font-medium text-slate-800">{r.locationCode}</span>
            <span className="shrink-0 tabular-nums text-[12px] font-semibold text-slate-900">
              {fmtPlacementQty(r.quantity)} szt.
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between gap-6 border-t border-slate-100 pt-1.5">
        <span className="text-[11px] font-semibold text-slate-600">Razem</span>
        <span className="tabular-nums text-[12px] font-bold text-slate-900">
          {fmtPlacementQty(total)} szt.
        </span>
      </div>
    </div>
  );

  return (
    <HoverPopover content={popover}>
      <span className="inline-flex max-w-[14rem] cursor-default flex-col items-start gap-0.5 outline-none">
        <LocationBadge
          code={first.locationCode}
          type={first.locationType}
          quantity={first.quantity}
          className="max-w-full"
        />
        <span className="pl-0.5 text-[10px] font-semibold text-slate-500">
          +{extra} lokalizacje
        </span>
      </span>
    </HoverPopover>
  );
}

export function WarehouseLineProductThumb({ url, compact }: { url?: string | null; compact?: boolean }) {
  const [bad, setBad] = useState(false);
  const src = url && !bad ? url : null;
  const sizeCls = compact ? "h-8 w-8" : "h-10 w-10";
  const imgCls = compact ? "max-h-8 max-w-8" : "max-h-10 max-w-10";
  return (
    <div className={`flex ${sizeCls} shrink-0 items-center justify-center overflow-hidden`}>
      {src ? (
        <img
          src={src}
          alt=""
          className={`${imgCls} object-contain object-center mix-blend-multiply`}
          onError={() => setBad(true)}
          loading="lazy"
        />
      ) : (
        <span className="text-[10px] font-medium text-slate-300">—</span>
      )}
    </div>
  );
}
