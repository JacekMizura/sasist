import { useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export type AutomationBadgeTone = "default" | "added" | "removed" | "changed";

const toneClass: Record<AutomationBadgeTone, string> = {
  default:
    "border-slate-200 bg-slate-50 text-slate-700",
  added:
    "border-emerald-200 bg-emerald-50 text-emerald-800",
  removed:
    "border-rose-200 bg-rose-50 text-rose-800 line-through decoration-rose-400/80",
  changed:
    "border-amber-200 bg-amber-50 text-amber-900",
};

export const automationValueBadgeClass =
  "inline-flex max-w-[12rem] shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none";

type Props = {
  labels: string[];
  /** Optional per-label tone (history diff). Falls back to default. */
  tones?: AutomationBadgeTone[];
  /** Collapsed summary: show as many badges as fit in one row, then +N. */
  fitToWidth?: boolean;
  onRemove?: (index: number) => void;
  onBadgeClick?: (index: number) => void;
  removable?: boolean;
};

function BadgeChip({
  label,
  index,
  tone = "default",
  removable,
  onRemove,
  onBadgeClick,
  measure,
}: {
  label: string;
  index: number;
  tone?: AutomationBadgeTone;
  removable?: boolean;
  onRemove?: (index: number) => void;
  onBadgeClick?: (index: number) => void;
  measure?: boolean;
}) {
  return (
    <span data-badge className={`${automationValueBadgeClass} ${toneClass[tone]}`}>
      {onBadgeClick ? (
        <button type="button" className="min-w-0 truncate text-left" onClick={() => onBadgeClick(index)}>
          {label}
        </button>
      ) : (
        <span className="min-w-0 truncate">{label}</span>
      )}
      {removable && onRemove && !measure ? (
        <button
          type="button"
          className="inline-flex shrink-0 rounded text-slate-400 hover:text-slate-700"
          aria-label={`Usuń ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(index);
          }}
        >
          <X className="h-3 w-3" strokeWidth={2.5} />
        </button>
      ) : null}
    </span>
  );
}

export function AutomationValueBadges({
  labels,
  tones,
  fitToWidth = false,
  onRemove,
  onBadgeClick,
  removable = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(labels.length);

  useLayoutEffect(() => {
    if (!fitToWidth || removable || labels.length === 0) {
      setVisibleCount(labels.length);
      return;
    }

    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const recompute = () => {
      const maxW = container.clientWidth;
      if (maxW <= 0) return;
      const badges = [...measure.querySelectorAll<HTMLElement>("[data-badge]")];
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

      if (count === 0 && labels.length > 0) count = 1;
      setVisibleCount(count);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [labels, tones, fitToWidth, removable]);

  if (labels.length === 0) return null;

  if (!fitToWidth || removable) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {labels.map((label, index) => (
          <BadgeChip
            key={`${label}-${index}`}
            label={label}
            index={index}
            tone={tones?.[index] ?? "default"}
            removable={removable}
            onRemove={onRemove}
            onBadgeClick={onBadgeClick}
          />
        ))}
      </div>
    );
  }

  const visible = labels.slice(0, visibleCount);
  const overflow = Math.max(0, labels.length - visibleCount);

  return (
    <div ref={containerRef} className="relative min-w-0 w-full">
      <div
        ref={measureRef}
        className="pointer-events-none invisible absolute left-0 top-0 flex h-0 flex-nowrap items-center gap-1.5 overflow-hidden"
        aria-hidden
      >
        {labels.map((label, index) => (
          <BadgeChip
            key={`m-${label}-${index}`}
            label={label}
            index={index}
            tone={tones?.[index] ?? "default"}
            measure
          />
        ))}
        <span data-plus className="shrink-0 text-xs font-medium text-slate-500">
          +99
        </span>
      </div>

      <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
        {visible.map((label, index) => (
          <BadgeChip
            key={`${label}-${index}`}
            label={label}
            index={index}
            tone={tones?.[index] ?? "default"}
            onBadgeClick={onBadgeClick}
          />
        ))}
        {overflow > 0 ? (
          <span className="shrink-0 text-xs font-medium text-slate-500">+{overflow}</span>
        ) : null}
      </div>
    </div>
  );
}
