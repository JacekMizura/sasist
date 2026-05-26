import { ChevronIcon } from "./Icons";

type GroupHeaderProps = {
  title: string;
  count: number;
  summaryText?: string;
  collapsed: boolean;
  onToggle: () => void;
  rightActions?: React.ReactNode;
};

export default function GroupHeader({
  title,
  count,
  summaryText,
  collapsed,
  onToggle,
  rightActions,
}: GroupHeaderProps) {
  return (
    <div className="flex w-full items-center justify-between gap-2 border-b border-slate-200 py-3">
      <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4">
        <div className={`shrink-0 transition-transform ${collapsed ? "" : "rotate-90"}`}>
          <ChevronIcon className="h-5 w-5 text-slate-400" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="text-sm font-semibold text-slate-900">
            {title}{" "}
            <span className="font-medium text-slate-400">({count})</span>
          </div>
          {summaryText ? (
            <div className="text-xs text-slate-600">{summaryText}</div>
          ) : null}
        </div>
      </button>
      <div className="ml-2 flex shrink-0 flex-wrap items-center justify-end gap-2">{rightActions}</div>
    </div>
  );
}

