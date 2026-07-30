import { X } from "lucide-react";

const BADGE_MAX_COLLAPSED = 3;

export const automationValueBadgeClass =
  "inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none";

export function AutomationValueBadges({
  labels,
  maxVisible = BADGE_MAX_COLLAPSED,
  onRemove,
  onBadgeClick,
  removable = false,
}: {
  labels: string[];
  maxVisible?: number;
  onRemove?: (index: number) => void;
  onBadgeClick?: (index: number) => void;
  removable?: boolean;
}) {
  if (labels.length === 0) return null;
  const visible = removable ? labels : labels.slice(0, maxVisible);
  const overflow = removable ? 0 : Math.max(0, labels.length - maxVisible);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((label, index) => (
        <span key={`${label}-${index}`} className={automationValueBadgeClass}>
          {onBadgeClick && !removable ? (
            <button type="button" className="min-w-0 truncate text-left" onClick={() => onBadgeClick(index)}>
              {label}
            </button>
          ) : onBadgeClick && removable ? (
            <button type="button" className="min-w-0 truncate text-left" onClick={() => onBadgeClick(index)}>
              {label}
            </button>
          ) : (
            <span className="min-w-0 truncate">{label}</span>
          )}
          {removable && onRemove ? (
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
      ))}
      {overflow > 0 ? (
        <span className="text-xs font-medium text-slate-500">+{overflow}</span>
      ) : null}
    </div>
  );
}
