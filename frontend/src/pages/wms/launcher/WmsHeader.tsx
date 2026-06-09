import { LogOut, Warehouse } from "lucide-react";
import { useEffect, useState } from "react";

import GlobalWarehouseSelect from "@/components/layout/GlobalWarehouseSelect";

type Props = {
  warehouseName: string;
  operatorLabel: string;
  operatorLogin?: string | null;
  showWarehouseSelector?: boolean;
  terminalOnline?: boolean;
  onLogout: () => void;
};

export default function WmsHeader({
  warehouseName,
  operatorLabel,
  operatorLogin,
  showWarehouseSelector,
  terminalOnline = true,
  onLogout,
}: Props) {
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const timeLabel = clock.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateLabel = clock.toLocaleDateString("pl-PL", { weekday: "short", day: "2-digit", month: "2-digit" });

  return (
    <header className="sticky top-0 z-20 border-b-4 border-[#0f2744] bg-[#1e3a5f] text-white">
      <div className="flex min-h-[4.25rem] flex-wrap items-center justify-between gap-3 px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-white/30 bg-[#0f2744]">
            <Warehouse size={24} strokeWidth={2.25} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-blue-200/90">Terminal WMS</p>
            <h1 className="truncate text-lg font-black leading-tight sm:text-xl">{warehouseName}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <div
            className="hidden items-center gap-2 border border-white/20 bg-[#0f2744]/60 px-3 py-1.5 text-xs font-bold sm:flex"
            title={operatorLogin ?? undefined}
          >
            <span className="text-blue-200/90">Operator</span>
            <span className="max-w-[10rem] truncate text-white">{operatorLabel}</span>
          </div>

          <div className="flex items-center gap-2 border border-white/20 bg-[#0f2744]/60 px-3 py-1.5 tabular-nums">
            <span className="text-lg font-black leading-none">{timeLabel}</span>
            <span className="hidden text-[10px] font-bold uppercase tracking-wide text-blue-200/80 sm:inline">{dateLabel}</span>
          </div>

          <div className="flex items-center gap-2 border border-white/20 bg-[#0f2744]/60 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
            <span
              className={`inline-block h-2.5 w-2.5 shrink-0 ${terminalOnline ? "bg-emerald-400" : "bg-amber-400"}`}
              aria-hidden
            />
            <span className="text-blue-100">{terminalOnline ? "Online" : "Offline"}</span>
          </div>

          {showWarehouseSelector ? (
            <div className="w-40 sm:w-48 [&_select]:border-white/30 [&_select]:bg-[#0f2744] [&_select]:text-xs [&_select]:text-white">
              <GlobalWarehouseSelect variant="topbar" className="w-full" />
            </div>
          ) : null}

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-11 min-w-[7.5rem] items-center justify-center gap-2 border-2 border-white/30 bg-[#0f2744] px-3 text-xs font-black uppercase tracking-wide text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 active:bg-[#09182a]"
          >
            <LogOut size={16} strokeWidth={2.5} aria-hidden />
            Wyloguj
          </button>
        </div>
      </div>
    </header>
  );
}
