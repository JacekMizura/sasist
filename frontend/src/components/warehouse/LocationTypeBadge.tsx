import type { MouseEvent } from "react";
import { MapPin } from "lucide-react";
import { formatWarehouseLocationTypeLabel } from "../../utils/warehouseLocationTypeLabels";
import { getStorageTypeStyle, normalizeStorageType } from "../../utils/storageTypes";
import { StorageTypeIcon } from "../../utils/storageTypeIcons";

export type LocationTypeBadgeProps = {
  /** Display address / code (e.g. A1-4-1) */
  locationText: string;
  /** Omit or undefined when only the location name is shown (e.g. picker list before assign). */
  quantity?: number;
  storageType: unknown;
  /** Mniejszy, „magazynowy” badge — qty bez dopisku „szt.” (OMS / lista zamówień). */
  compact?: boolean;
  className?: string;
  title?: string;
  /** Capacity / volume overflow — red chrome instead of type colors */
  volumeError?: boolean;
  /**
   * Full-width row: location left, quantity right (no ellipsis on the name).
   * Prefer for product list / wide containers.
   */
  layoutSpread?: boolean;
  /** Left type icon (color still comes from badge chrome). Default true. */
  showTypeIcon?: boolean;
  /** Optional: open warehouse map for this location (icon on the right; stops row click propagation). */
  mapPinAction?: {
    onClick: (e: MouseEvent) => void;
    title?: string;
  };
};

/**
 * Location chip: type color chrome + location label + quantity.
 * With {@link layoutSpread}, name is never truncated — badge fills the row.
 */
export function LocationTypeBadge({
  locationText,
  quantity,
  storageType,
  compact = false,
  className = "",
  title,
  volumeError,
  layoutSpread = false,
  showTypeIcon = true,
  mapPinAction,
}: LocationTypeBadgeProps) {
  const st = normalizeStorageType(storageType);
  const typeStyle = getStorageTypeStyle(st);
  const bg = volumeError ? "#fef2f2" : typeStyle.bg;
  const border = volumeError ? "#fecaca" : typeStyle.border;
  const iconColor = volumeError ? "#b91c1c" : typeStyle.text;

  const qtyStr =
    quantity != null && Number.isFinite(quantity)
      ? Number.isInteger(quantity)
        ? String(quantity)
        : String(quantity)
      : null;

  const trimmedLocation = (locationText ?? "").trim();
  const displayLocationText =
    trimmedLocation.includes("-") || /\d/.test(trimmedLocation)
      ? trimmedLocation
      : formatWarehouseLocationTypeLabel(locationText);

  const rowClass = layoutSpread
    ? compact
      ? `flex h-auto min-h-7 w-full items-center justify-between gap-3 rounded border px-2.5 py-1 text-left shadow-sm ${className}`
      : `flex w-full items-center justify-between gap-3 rounded-md border px-2.5 py-1.5 text-left shadow-sm ${className}`
    : compact
      ? `inline-flex h-auto min-h-7 w-fit flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded border px-2.5 py-0 text-left shadow-sm ${className}`
      : `inline-flex w-fit flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border px-2.5 py-1 text-left shadow-sm ${className}`;

  const locationClass = layoutSpread
    ? compact
      ? "mr-auto whitespace-normal break-words text-left font-mono text-[13px] font-semibold leading-snug text-slate-900"
      : "mr-auto whitespace-normal break-words text-left font-mono text-[13px] font-medium leading-snug text-slate-800"
    : compact
      ? "whitespace-normal break-words font-mono text-[13px] font-semibold leading-snug text-slate-900"
      : "whitespace-normal break-words font-mono text-[13px] font-medium leading-snug text-slate-800";

  return (
    <div
      className={rowClass}
      style={{ backgroundColor: bg, borderColor: border, borderWidth: 1 }}
      title={
        title ??
        (qtyStr != null ? `${displayLocationText} — ${qtyStr} szt.` : displayLocationText)
      }
    >
      {showTypeIcon ? (
        <span className="shrink-0 opacity-[0.72]" style={{ color: iconColor }} aria-hidden>
          <StorageTypeIcon storageType={st} size={11} className="block" />
        </span>
      ) : null}
      <span className={locationClass}>{displayLocationText}</span>
      {qtyStr != null && (
        <span
          className={`shrink-0 whitespace-nowrap text-right tabular-nums leading-none tracking-tight text-slate-900 ${
            compact ? "text-[13px] font-bold" : "text-[15px] font-bold tracking-tight"
          }`}
        >
          {qtyStr}
          {!compact ? " szt." : null}
        </span>
      )}
      {mapPinAction != null && (
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:bg-black/[0.06] hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          title={mapPinAction.title ?? "Pokaż na mapie magazynu"}
          aria-label={mapPinAction.title ?? "Pokaż na mapie magazynu"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            mapPinAction.onClick(e);
          }}
        >
          <MapPin className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      )}
    </div>
  );
}
