import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";

type Props = {
  title: string;
  description?: string;
  icon?: ReactNode;
  onRefresh?: () => void;
  refreshLabel?: string;
};

/** Left-aligned operational empty state — no centered hero layout. */
export function WmsTerminalEmptyState({
  title,
  description,
  icon,
  onRefresh,
  refreshLabel = "Odśwież",
}: Props) {
  return (
    <div className="w-full max-w-[420px] rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-5 py-6">
      <div className="flex items-start gap-4">
        {icon ? (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          {description ? <p className="text-sm leading-relaxed text-slate-600">{description}</p> : null}
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {refreshLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
