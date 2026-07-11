import { useState } from "react";
import type { StockDocumentItemRead } from "../../api/stockDocumentsApi";
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

export function receiptLineLocationCode(it: StockDocumentItemRead): string | null {
  const last = (it.putaway_last_location_name || "").trim();
  if (last) return last;
  const a = it.putaway_allocations ?? [];
  const first = (a[0]?.location_code || a[0]?.location_name || "").trim();
  return first || null;
}

export function wzLineLocationCode(it: StockDocumentItemRead): string | null {
  const mm = (it.mm_line_from_location_name || "").trim();
  if (mm) return mm;
  return receiptLineLocationCode(it);
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
}: {
  it: StockDocumentItemRead;
  isWz: boolean;
}) {
  const code = isWz ? wzLineLocationCode(it) : receiptLineLocationCode(it);
  if (!code) return <span className="text-xs text-slate-400">—</span>;
  const locType = (it.putaway_last_location_type || "PICK").trim() || "PICK";
  return <LocationBadge code={code} type={locType} className="max-w-[10rem]" />;
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
