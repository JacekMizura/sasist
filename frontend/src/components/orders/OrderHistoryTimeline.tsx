import type { ReactNode } from "react";
import { Check, Clock, Info, MapPin, Truck, User } from "lucide-react";
import type { OrderHistoryTimelineEvent } from "./orderHistoryTimelineModel";

function HistoryBadge({ label, tone }: { label: string; tone: "muted" | "dark" | "blue" }) {
  const cls =
    tone === "dark"
      ? "shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium leading-none text-white"
      : tone === "blue"
        ? "shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium leading-none text-blue-700"
        : "shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium leading-none text-slate-600";
  return <span className={cls}>{label}</span>;
}

function MetaIconRow({
  children,
  icon: Icon,
  compact,
}: {
  children: ReactNode;
  icon: typeof User | typeof Clock | typeof MapPin;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-start gap-2 text-xs text-slate-500 ${compact ? "mt-1" : "mt-2"}`}>
      <Icon
        className={`mt-0.5 shrink-0 text-slate-400 ${compact ? "h-3 w-3" : "h-3.5 w-3.5"}`}
        strokeWidth={2}
        aria-hidden
      />
      <span className="min-w-0 leading-snug">{children}</span>
    </div>
  );
}

function AutomationMetaRow({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex items-start gap-2 text-xs text-slate-500 ${compact ? "mt-1" : "mt-2"}`}>
      <span
        className={`mt-0.5 flex shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-50 font-bold leading-none text-slate-600 ${compact ? "h-3 w-3 text-[8px]" : "h-3.5 w-3.5 text-[9px]"}`}
        aria-hidden
      >
        A
      </span>
      <span className="min-w-0 leading-snug">{children}</span>
    </div>
  );
}

function TimelineEventCard({
  ev,
  formatDate,
  compact,
}: {
  ev: OrderHistoryTimelineEvent;
  formatDate: (iso: string) => string;
  compact?: boolean;
}) {
  const titleRow = (
    <div className="flex items-start justify-between gap-2">
      <p className={`font-bold leading-snug text-slate-900 ${compact ? "text-xs" : "text-[13px]"}`}>{ev.title}</p>
      {ev.badge ? <HistoryBadge label={ev.badge.label} tone={ev.badge.tone} /> : null}
    </div>
  );

  const metaBlocks = (
    <>
      {ev.userName ? (
        <MetaIconRow icon={User} compact={compact}>
          <span className="text-slate-600">{ev.userName}</span>
        </MetaIconRow>
      ) : null}
      {ev.description && ev.variant === "note" ? (
        <MetaIconRow icon={MapPin} compact={compact}>
          <span className="text-slate-600">{ev.description}</span>
        </MetaIconRow>
      ) : ev.description ? (
        <p className={`text-xs leading-snug text-slate-600 ${compact ? "mt-1" : "mt-2"}`}>{ev.description}</p>
      ) : null}
      {ev.automationLabel ? (
        <AutomationMetaRow compact={compact}>{ev.automationLabel}</AutomationMetaRow>
      ) : null}
      <MetaIconRow icon={Clock} compact={compact}>
        <span className="text-slate-500">{formatDate(ev.at)}</span>
      </MetaIconRow>
    </>
  );

  if (ev.variant === "note") {
    return (
      <div
        className={
          compact
            ? "rounded-md border border-slate-200/90 bg-slate-50/90 p-2"
            : "rounded-lg border border-yellow-200 bg-yellow-50 p-3"
        }
      >
        {titleRow}
        {metaBlocks}
      </div>
    );
  }

  return (
    <div className="text-left">
      {titleRow}
      {metaBlocks}
    </div>
  );
}

export function OrderHistoryTimeline({
  events,
  formatDate,
  compact,
}: {
  events: OrderHistoryTimelineEvent[];
  formatDate: (iso: string) => string;
  compact?: boolean;
}) {
  const shell = compact ? "shadow-none" : "shadow-sm";
  const headerPad = compact ? "px-2 py-1.5" : "px-3 py-2";
  const titleCls = compact
    ? "text-[10px] font-bold uppercase tracking-wide text-slate-700"
    : "text-xs font-bold uppercase tracking-wide text-slate-800";
  const iconBox = compact ? "h-6 w-6" : "h-8 w-8";
  const truckIcon = compact ? "h-3 w-3" : "h-4 w-4";
  const infoIcon = compact ? "h-3 w-3" : "h-4 w-4";

  return (
    <div className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${shell}`}>
      <div className={`flex items-center justify-between border-b border-slate-200/90 bg-white ${headerPad}`}>
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className={`min-w-0 truncate ${titleCls}`}>Oś czasu — zdarzenia i operatorzy</h3>
          <Info className={`${infoIcon} shrink-0 text-blue-600`} strokeWidth={2} aria-hidden />
        </div>
        <span
          className={`flex ${iconBox} shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700`}
          aria-hidden
        >
          <Truck className={truckIcon} strokeWidth={2} />
        </span>
      </div>

      {events.length === 0 ? (
        <p className={`text-center text-xs text-slate-500 ${compact ? "px-2 py-3" : "px-3 py-6"}`}>
          Brak wpisów w historii.
        </p>
      ) : (
        <div className={`relative bg-white ${compact ? "px-2 pb-2 pt-2" : "px-3 pb-4 pt-3"}`}>
          <div
            className={`absolute w-px bg-slate-200/90 ${compact ? "bottom-2 left-[11px] top-2" : "bottom-4 left-[13px] top-3"}`}
            aria-hidden
          />

          <ul className="relative">
            {events.map((ev) => (
              <li
                key={ev.key}
                className={`relative ${compact ? "pb-3 pl-8 last:pb-0" : "pb-6 pl-9 last:pb-0"}`}
              >
                <span
                  className={`absolute z-[1] flex items-center justify-center rounded-full bg-emerald-500 shadow-[0_0_0_3px_#fff] ${compact ? "left-[1px] top-1 h-4 w-4" : "left-[2px] top-2 h-[18px] w-[18px]"}`}
                  aria-hidden
                >
                  <Check className={`text-white ${compact ? "h-2 w-2" : "h-2.5 w-2.5"}`} strokeWidth={3} />
                </span>
                <TimelineEventCard ev={ev} formatDate={formatDate} compact={compact} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
