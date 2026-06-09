import { ChevronRight } from "lucide-react";

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
    <div className="flex w-full items-center justify-between gap-2 border-b border-slate-200/90 bg-white px-3 py-2">
      <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${collapsed ? "" : "rotate-90"}`}
          aria-hidden
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="text-[13px] font-semibold text-slate-900">
            {title}{" "}
            <span className="font-normal text-slate-400">({count})</span>
          </div>
          {summaryText ? <div className="text-[11px] text-slate-500">{summaryText}</div> : null}
        </div>
      </button>
      {rightActions ? (
        <div className="ml-2 flex shrink-0 flex-wrap items-center justify-end gap-1.5">{rightActions}</div>
      ) : null}
    </div>
  );
}
