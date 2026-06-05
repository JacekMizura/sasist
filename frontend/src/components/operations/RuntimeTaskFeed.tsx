import type { FeedLine } from "../../hooks/runtime/formatRuntimeFeedLine";

type Props = {
  lines: FeedLine[];
  emptyLabel?: string;
};

const TONE_CLASS: Record<FeedLine["tone"], string> = {
  info: "border-l-sky-400",
  warn: "border-l-amber-500",
  success: "border-l-emerald-500",
  muted: "border-l-slate-300",
};

export function RuntimeTaskFeed({ lines, emptyLabel = "Brak zdarzeń na żywo." }: Props) {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Strumień operacyjny
      </div>
      <ul className="divide-y divide-slate-50">
        {lines.length === 0 ? (
          <li className="px-3 py-6 text-sm text-slate-400">{emptyLabel}</li>
        ) : (
          lines.map((ln) => (
            <li
              key={ln.id}
              className={`border-l-2 px-3 py-2 text-sm text-slate-800 ${TONE_CLASS[ln.tone]}`}
            >
              {ln.text}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
