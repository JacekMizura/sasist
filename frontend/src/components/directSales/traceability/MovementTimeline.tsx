import type { DirectSaleTimelineEvent } from "../../../types/directSalesCompletion";

type Props = {
  events: DirectSaleTimelineEvent[];
};

function formatAt(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

export function MovementTimeline({ events }: Props) {
  if (!events.length) return <p className="text-xs text-slate-500">Brak zdarzeń w historii operacji.</p>;
  return (
    <ol className="space-y-2 border-l-2 border-slate-200 pl-3">
      {events.map((ev, i) => (
        <li key={`${ev.kind}-${i}`} className="relative text-xs">
          <span className="absolute -left-[0.55rem] top-1 h-2 w-2 rounded-full bg-sky-500" />
          <div className="font-medium text-slate-800">{ev.label}</div>
          {ev.detail ? <div className="text-slate-500">{ev.detail}</div> : null}
          {ev.at ? <div className="text-[10px] text-slate-400">{formatAt(ev.at)}</div> : null}
        </li>
      ))}
    </ol>
  );
}
