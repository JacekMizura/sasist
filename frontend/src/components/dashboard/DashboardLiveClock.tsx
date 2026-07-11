import { memo, useEffect, useState } from "react";

function DashboardLiveClockInner() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <time className="tabular-nums text-slate-800" dateTime={now.toISOString()}>
      {new Intl.DateTimeFormat("pl-PL", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(now)}
    </time>
  );
}

/** Isolated clock — re-renders every second without updating the dashboard tree. */
export const DashboardLiveClock = memo(DashboardLiveClockInner);
