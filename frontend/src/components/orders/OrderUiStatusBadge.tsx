import { useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import type { PanelConfigurableUiStatusBrief } from "../../utils/panelListStatusBriefMappers";
import { OrderUiStatusConfigRowPresent } from "./orderList/OrderUiStatusConfigRowPresent";

export type OrderUiStatusBadgeProps = {
  status: PanelConfigurableUiStatusBrief | null | undefined;
  emptyLabel?: string;
  removable?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
  /** Measure-only (invisible) for fit-to-width layout. */
  measure?: boolean;
};

/**
 * Colored status chip — same color pipeline as panel / list
 * ({@link OrderUiStatusConfigRowPresent} → {@link panelSidebarSubRowStyleRich}).
 * Name only (no main-group suffix).
 */
export function OrderUiStatusBadge({
  status,
  emptyLabel = "Bez etykiety",
  removable = false,
  onRemove,
  onClick,
  className = "",
  measure = false,
}: OrderUiStatusBadgeProps) {
  const brief: PanelConfigurableUiStatusBrief = status ?? {
    name: emptyLabel,
    color: "#94a3b8",
    main_group: "DONE",
  };

  const label = (
    <OrderUiStatusConfigRowPresent status={brief} variant="inline" className="max-w-[11rem]" />
  );

  return (
    <span
      data-status-badge
      className={`inline-flex max-w-[12rem] shrink-0 items-center gap-0.5 ${className}`.trim()}
    >
      {onClick && !measure ? (
        <button type="button" className="min-w-0 text-left" onClick={onClick}>
          {label}
        </button>
      ) : (
        label
      )}
      {removable && onRemove && !measure ? (
        <button
          type="button"
          className="inline-flex shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label={`Usuń ${brief.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="h-3 w-3" strokeWidth={2.5} />
        </button>
      ) : null}
    </span>
  );
}

export type OrderUiStatusBadgeListProps = {
  statuses: Array<PanelConfigurableUiStatusBrief | null | undefined>;
  fitToWidth?: boolean;
  removable?: boolean;
  onRemove?: (index: number) => void;
  onBadgeClick?: (index: number) => void;
  className?: string;
};

/**
 * Row of status badges; optional single-line fit with +N overflow (same idea as automation value chips).
 */
export function OrderUiStatusBadgeList({
  statuses,
  fitToWidth = false,
  removable = false,
  onRemove,
  onBadgeClick,
  className = "",
}: OrderUiStatusBadgeListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(statuses.length);

  useLayoutEffect(() => {
    if (!fitToWidth || removable || statuses.length === 0) {
      setVisibleCount(statuses.length);
      return;
    }

    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const recompute = () => {
      const maxW = container.clientWidth;
      if (maxW <= 0) return;
      const badges = [...measure.querySelectorAll<HTMLElement>("[data-status-badge]")];
      const plusEl = measure.querySelector<HTMLElement>("[data-plus]");
      const gap = 6;
      const plusW = plusEl?.offsetWidth ?? 28;
      let used = 0;
      let count = 0;

      for (let i = 0; i < badges.length; i++) {
        const remainingAfter = badges.length - i - 1;
        const reservePlus = remainingAfter > 0 ? plusW + gap : 0;
        const bw = badges[i]!.offsetWidth;
        const next = used + (count > 0 ? gap : 0) + bw;
        if (next + reservePlus <= maxW + 0.5) {
          used = next;
          count += 1;
        } else {
          break;
        }
      }

      if (count === 0 && statuses.length > 0) count = 1;
      setVisibleCount(count);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [statuses, fitToWidth, removable]);

  if (statuses.length === 0) return null;

  if (!fitToWidth || removable) {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`.trim()}>
        {statuses.map((status, index) => (
          <OrderUiStatusBadge
            key={`${status?.name ?? "empty"}-${index}`}
            status={status}
            removable={removable}
            onRemove={onRemove ? () => onRemove(index) : undefined}
            onClick={onBadgeClick ? () => onBadgeClick(index) : undefined}
          />
        ))}
      </div>
    );
  }

  const visible = statuses.slice(0, visibleCount);
  const overflow = Math.max(0, statuses.length - visibleCount);

  return (
    <div ref={containerRef} className={`relative min-w-0 w-full ${className}`.trim()}>
      <div
        ref={measureRef}
        className="pointer-events-none invisible absolute left-0 top-0 flex h-0 flex-nowrap items-center gap-1.5 overflow-hidden"
        aria-hidden
      >
        {statuses.map((status, index) => (
          <OrderUiStatusBadge key={`m-${index}`} status={status} measure />
        ))}
        <span data-plus className="shrink-0 text-xs font-medium text-slate-500">
          +99
        </span>
      </div>

      <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
        {visible.map((status, index) => (
          <OrderUiStatusBadge
            key={`${status?.name ?? "empty"}-${index}`}
            status={status}
            onClick={onBadgeClick ? () => onBadgeClick(index) : undefined}
          />
        ))}
        {overflow > 0 ? (
          <span className="shrink-0 text-xs font-medium text-slate-500">+{overflow}</span>
        ) : null}
      </div>
    </div>
  );
}
