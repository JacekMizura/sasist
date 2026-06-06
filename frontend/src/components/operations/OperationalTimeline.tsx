import type { FeedLine } from "../../hooks/runtime/formatRuntimeFeedLine";

type Props = {
  lines: FeedLine[];
  title?: string;
};

export function OperationalTimeline({ lines, title = "Puls magazynu" }: Props) {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <ul className="divide-y divide-slate-50">
        {lines.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-slate-500">
            <p className="font-medium text-slate-600">Cicho w magazynie</p>
            <p className="mt-1 text-xs">Aktywność operatorów pojawi się tutaj na żywo.</p>
          </li>
        ) : (
          lines.map((ln) => (
            <li key={ln.id} className="flex gap-2 px-3 py-2 text-sm">
              <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                {ln.at ? new Date(ln.at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : "—"}
              </span>
              <span className="text-slate-800">{ln.text}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
