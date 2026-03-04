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
    <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 flex items-center justify-between">
      <button onClick={onToggle} className="flex items-center gap-4 flex-1 text-left">
        <div className={`transition-transform ${collapsed ? "" : "rotate-90"}`}>
          <ChevronIcon className="w-5 h-5 text-slate-400" />
        </div>
        <div>
          <div className="text-[11px] font-black text-slate-700 uppercase tracking-[0.25em] italic">
            {title} <span className="ml-2 text-slate-300 font-black">({count})</span>
          </div>
          {summaryText ? (
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              {summaryText}
            </div>
          ) : null}
        </div>
      </button>
      <div className="flex items-center gap-3">{rightActions}</div>
    </div>
  );
}

