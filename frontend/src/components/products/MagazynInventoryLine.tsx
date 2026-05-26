import { Pencil } from "lucide-react";
import { StorageTypeIcon } from "../../utils/storageTypeIcons";
import { getStorageTypeStyle, normalizeStorageType } from "../../utils/storageTypes";
import { CarrierBadge } from "../warehouse/carriers/CarrierBadge";

export type MagazynInvRowDisplay = {
  inventory_id?: number | null;
  inventory_serial_ids?: number[];
  location_id: number;
  location_code: string;
  location_type: string;
  quantity: number;
  batch?: string | null;
  expiry?: string | null;
  serial_range_label?: string | null;
  serial_numbers?: string[];
  warehouse_id?: number;
  location_uuid?: string | null;
  /** Canonical warehouse bucket e.g. SALEABLE, OUTLET_B */
  stock_disposition?: string | null;
  /** Short badge from API e.g. [B], [C] */
  disposition_badge?: string | null;
  warehouse_carrier_id?: number | null;
  carrier_code?: string | null;
  carrier_barcode?: string | null;
  carrier_is_mixed?: boolean;
};

type DispositionVariant = "saleable" | "outlet_b" | "service_c" | "rejected" | "other";

/** Align with backend ``stock_disposition_display_badge`` — used when API omits ``disposition_badge``. */
export function fallbackBadgeFromDisposition(code: string): string | null {
  const c = code.trim().toUpperCase();
  if (!c || c === "SALEABLE") return null;
  if (c === "OUTLET_B") return "[B]";
  if (c === "SERVICE_C") return "[C]";
  if (c === "REJECTED_STOCK") return "[X]";
  if (c === "QUARANTINE") return "[Q]";
  if (c === "SCRAP") return "[S]";
  return `[${c.slice(0, 8)}]`;
}

function dispositionVariant(sdRaw: string | null | undefined, badgeText: string | null): DispositionVariant {
  const b = (badgeText ?? "").trim().toUpperCase();
  if (b === "[B]") return "outlet_b";
  if (b === "[C]") return "service_c";
  if (b === "[X]") return "rejected";
  const sd = (sdRaw ?? "").trim().toUpperCase();
  if (sd === "OUTLET_B") return "outlet_b";
  if (sd === "SERVICE_C") return "service_c";
  if (sd === "REJECTED_STOCK") return "rejected";
  if ((badgeText ?? "").trim()) return "other";
  return "saleable";
}

function dispositionHumanLabel(variant: DispositionVariant, sdRaw: string): string | null {
  const sd = sdRaw.trim().toUpperCase();
  if (variant === "rejected") return "USZKODZONE";
  if (sd === "QUARANTINE") return "QC";
  return null;
}

function dispositionBadgeClass(variant: DispositionVariant): string {
  switch (variant) {
    case "outlet_b":
      return "rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-950 ring-1 ring-amber-200/80";
    case "service_c":
      return "rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-orange-950 ring-1 ring-orange-300/70";
    case "rejected":
      return "rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-950 ring-1 ring-red-300/80";
    case "other":
      return "rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-800 ring-1 ring-slate-300/80";
    default:
      return "";
  }
}

export function magazynInventoryRowReactKey(row: MagazynInvRowDisplay, idx: number): string {
  const sd = (row.stock_disposition ?? "SALEABLE").trim().toUpperCase() || "SALEABLE";
  const wh = row.warehouse_id ?? 0;
  const inv = row.inventory_id ?? 0;
  const bn = String(row.batch ?? "").trim();
  const ex = String(row.expiry ?? "").trim();
  const u = String(row.location_uuid ?? "").trim();
  const wc = row.warehouse_carrier_id != null && row.warehouse_carrier_id > 0 ? String(row.warehouse_carrier_id) : "";
  const sns = (row.serial_numbers ?? []).join(",");
  return `inv-${wh}-${inv}-${row.location_id}-${sd}-${bn}-${ex}-${u}-${wc}-${sns}-${idx}`;
}

/** Parse API / display expiry to local calendar date (YYYY-MM-DD or DD.MM.YYYY). */
function parseExpiryToDate(raw: string | null | undefined): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const dm = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (dm) {
    const d = Number(dm[1]);
    const m = Number(dm[2]);
    const y = Number(dm[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function formatExpiryDdMmYyyy(raw: string | null | undefined): string | null {
  const d = parseExpiryToDate(raw);
  if (!d) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** Expiry pill tone only — does not change location row chrome. */
function expiryPillTone(raw: string | null | undefined): "expired" | "soon" | "ok" {
  const d = parseExpiryToDate(raw);
  if (!d) return "ok";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = (exp.getTime() - today.getTime()) / 86400000;
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "soon";
  return "ok";
}

function tracePillClass(kind: "batch" | "expiry" | "serial", expiryTone?: "expired" | "soon" | "ok"): string {
  const base = "rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-tight";
  if (kind === "batch") return `${base} border-slate-200 bg-slate-50 text-slate-700`;
  if (kind === "serial") return `${base} border-violet-200 bg-violet-50 font-mono text-violet-900`;
  if (expiryTone === "expired") return `${base} border-red-200 bg-red-50 text-red-800`;
  if (expiryTone === "soon") return `${base} border-amber-200 bg-amber-50 text-amber-950`;
  return `${base} border-slate-200 bg-slate-50 text-slate-700`;
}

type MagazynInventoryLineProps = {
  row: MagazynInvRowDisplay;
  onEditTraceability?: (row: MagazynInvRowDisplay) => void;
  editDisabled?: boolean;
};

export function MagazynInventoryLine({ row, onEditTraceability, editDisabled }: MagazynInventoryLineProps) {
  const st = normalizeStorageType(row.location_type);
  const base = getStorageTypeStyle(st);
  const expDisp = formatExpiryDdMmYyyy(row.expiry);
  const expTone = row.expiry ? expiryPillTone(row.expiry) : "ok";
  const qty = row.quantity;
  const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
  const serialLabel =
    (row.serial_range_label || "").trim() ||
    (row.serial_numbers?.length ? row.serial_numbers.join(", ") : "");
  const sdNorm = (row.stock_disposition ?? "").trim();
  let badge = (row.disposition_badge ?? "").trim();
  if (!badge) {
    const fb = fallbackBadgeFromDisposition(sdNorm);
    if (fb) badge = fb;
  }
  const variant = dispositionVariant(row.stock_disposition, badge || null);
  const humanLabel = dispositionHumanLabel(variant, sdNorm);
  const badgeClass = badge || humanLabel ? dispositionBadgeClass(variant === "saleable" ? "other" : variant) : "";
  const carrierLabel =
    (row.carrier_code || "").trim() ||
    (row.carrier_barcode || "").trim() ||
    (row.warehouse_carrier_id != null && row.warehouse_carrier_id > 0 ? `#${row.warehouse_carrier_id}` : "");
  const canEdit =
    Boolean(onEditTraceability) &&
    !editDisabled &&
    (row.inventory_id != null || (row.inventory_serial_ids?.length ?? 0) > 0);
  const titleParts = [
    row.location_code,
    carrierLabel || undefined,
    badge || undefined,
    row.batch,
    expDisp,
    serialLabel || undefined,
  ].filter(Boolean);
  const title = `${titleParts.join(" · ")} — ${qtyStr} szt.`;

  return (
    <div
      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border px-2.5 py-2 shadow-sm"
      style={{ backgroundColor: base.bg, borderColor: base.border, borderWidth: 1 }}
      title={title}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <span className="mt-0.5 shrink-0 text-current [&_svg]:stroke-current" style={{ color: base.text }} aria-hidden>
          <StorageTypeIcon storageType={st} size={14} className="block" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <strong className="font-mono text-base font-semibold leading-snug" style={{ color: base.text }}>
              {row.location_code}
            </strong>
            {humanLabel ? <span className={badgeClass}>{humanLabel}</span> : badge ? <span className={badgeClass}>{badge}</span> : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {row.batch ? (
              <span className={tracePillClass("batch")}>
                <span className="font-normal text-slate-500">Partia </span>
                {row.batch}
              </span>
            ) : null}
            {expDisp ? (
              <span className={tracePillClass("expiry", expTone)}>
                <span className="font-normal text-slate-500">Ważność </span>
                {expDisp}
              </span>
            ) : null}
            {serialLabel ? (
              <span className={tracePillClass("serial")}>
                <span className="font-normal text-violet-600">Seryjny </span>
                {serialLabel}
              </span>
            ) : null}
          </div>
          {carrierLabel ? (
            <div className="flex items-center gap-1 text-[11px] text-slate-600">
              <span className="font-bold uppercase tracking-wide text-slate-400">Przyjęcie:</span>
              {carrierLabel === "Luzem" ? (
                <span className="font-semibold">Luzem</span>
              ) : (
                <CarrierBadge code={carrierLabel} />
              )}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <strong className="text-[17px] font-bold tabular-nums tracking-tight" style={{ color: base.text }}>
          {qtyStr} szt.
        </strong>
        {canEdit ? (
          <button
            type="button"
            onClick={() => onEditTraceability?.(row)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white/90 text-slate-600 shadow-sm hover:bg-white hover:text-indigo-700"
            title="Edytuj partię / ważność / serial"
            aria-label="Edytuj śledzenie partii"
          >
            <Pencil size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
