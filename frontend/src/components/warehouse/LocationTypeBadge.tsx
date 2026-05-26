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
   * Full-width row with `justify-between`, wrapping location text (no ellipsis).
   * Use in popovers / wide containers where names must stay readable.
   */
  layoutSpread?: boolean;
  /** Optional: open warehouse map for this location (icon on the right; stops row click propagation). */
  mapPinAction?: {
    onClick: (e: MouseEvent) => void;
    title?: string;
  };
};

/** Single-line row: [ subtle icon | location (medium) | quantity bold right ]. No type text labels — type is color + icon only. */
export function LocationTypeBadge({
  locationText,
  quantity,
  storageType,
  compact = false,
  className = "",
  title,
  volumeError,
  layoutSpread = false,
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

  const displayLocationText = formatWarehouseLocationTypeLabel(locationText);

  const rowClass = compact
    ? layoutSpread
      ? `flex h-7 min-h-7 w-full min-w-0 justify-between items-center gap-1.5 rounded border px-2.5 py-0 text-left shadow-sm ${className}`
      : `flex h-7 min-h-7 min-w-0 max-w-full items-center gap-1.5 rounded border px-2.5 py-0 text-left shadow-sm ${className}`
    : layoutSpread
      ? `flex w-full min-w-0 justify-between items-start gap-2 rounded-md border px-2.5 py-1.5 text-left shadow-sm ${className}`
      : `flex min-w-0 max-w-full items-center gap-2 rounded-md border px-2.5 py-1 text-left shadow-sm ${className}`;

  const locationClass = compact
    ? layoutSpread
      ? "min-w-0 flex-1 whitespace-normal break-words font-mono text-[13px] font-semibold leading-snug text-slate-900"
      : "min-w-0 flex-1 truncate font-mono text-[13px] font-semibold leading-none text-slate-900"
    : layoutSpread
      ? "min-w-0 flex-1 whitespace-normal break-words font-mono text-[13px] font-medium leading-snug text-slate-800"
      : "min-w-0 flex-1 truncate font-mono text-[13px] font-medium leading-none text-slate-800";

  return (
    <div
      className={rowClass}
      style={{ backgroundColor: bg, borderColor: border, borderWidth: 1 }}
      title={
        title ??
        (qtyStr != null ? `${displayLocationText} — ${qtyStr} szt.` : displayLocationText)
      }
    >
      <span
        className={`shrink-0 opacity-[0.72] ${layoutSpread && !compact ? "mt-0.5" : ""}`}
        style={{ color: iconColor }}
        aria-hidden
      >
        <StorageTypeIcon storageType={st} size={11} className="block" />
      </span>
      <span className={locationClass}>{displayLocationText}</span>
      {qtyStr != null && (
        <span
          className={`shrink-0 text-right tabular-nums leading-none tracking-tight text-slate-900 ${
            compact
              ? `text-[13px] font-bold ${layoutSpread ? "pl-1 whitespace-nowrap" : "pl-0.5"}`
              : `text-[15px] font-bold tracking-tight ${layoutSpread ? "pl-2 pt-0.5 whitespace-nowrap" : "pl-1"}`
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
