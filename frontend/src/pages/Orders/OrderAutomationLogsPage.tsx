import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Trash2, Clock, Activity } from "lucide-react";

import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { useOrderAutomationStore } from "../../hooks/useOrderAutomationStore";
import type { OrderAutomationLogEntry } from "../../types/orderAutomation";

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "medium" });
  } catch {
    return iso;
  }
}

function levelBadge(level: OrderAutomationLogEntry["level"]) {
  if (level === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (level === "error") return "border-red-200 bg-red-50 text-red-800";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

function levelDot(level: OrderAutomationLogEntry["level"]) {
  if (level === "success") return "bg-emerald-500";
  if (level === "error") return "bg-red-500";
  return "bg-blue-500";
}

export default function OrderAutomationLogsPage() {
  const { warehouse } = useWarehouse();
  const wid = warehouse?.id ?? null;
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("settings.automation");
  const { logs, reload, clearLogs } = useOrderAutomationStore(DAMAGE_TENANT_ID, wid);

  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void reload();
  }, [reload]);

  const sorted = useMemo(() => [...logs].sort((a, b) => b.ts.localeCompare(a.ts)), [logs]);

  if (wid == null) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 m-4 md:m-8">
        Wybierz magazyn w nagłówku aplikacji.
      </div>
    );
  }

  if (!canWrite) {
    return (
      <div className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 m-4 md:m-8">
        Brak uprawnienia <span className="font-mono text-[11px]">settings.automation</span>.
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen p-4 md:p-8 text-[13px] text-gray-800 font-sans w-full">
      <div className="max-w-[1600px] mx-auto space-y-6">
        
        {/* BREADCRUMBS I NAGŁÓWEK */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>

            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
              <Clock className="w-6 h-6 text-blue-600" />
              Dziennik wykonań
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (!window.confirm("Wyczyścić cały dziennik dla tego magazynu?")) return;
                clearLogs();
              }}
              className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors shadow-sm flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" strokeWidth={2} aria-hidden />
              Wyczyść dziennik
            </button>
          </div>
        </div>

        {/* INFO PASEK */}
        <div className="flex flex-wrap items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm gap-4">
          <p className="text-sm font-medium text-gray-600">
            Lista ostatnich uruchomień akcji automatycznych i testów (do <span className="font-bold text-gray-900">500</span> wpisów).
          </p>
          <div className="text-sm text-gray-400 font-medium">
            Łącznie wpisów: {sorted.length}
          </div>
        </div>

        {/* LISTA LOGÓW (OŚ CZASU) */}
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center shadow-sm mt-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 shadow-sm mb-6">
              <Activity className="h-8 w-8 text-gray-400" strokeWidth={1.75} aria-hidden />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Brak wpisów w dzienniku</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500">
              Uruchom test z listy reguł lub z edytora — wpisy pojawią się tutaj.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden p-6 md:p-8">
            <ol className="relative border-l-2 border-gray-100 ml-3 md:ml-4 space-y-6">
              {sorted.map((e) => {
                const isOpen = open[e.id] ?? false;
                return (
                  <li key={e.id} className="pl-6 md:pl-8 relative">
                    {/* Kolorowa kropka na osi czasu */}
                    <span 
                      className={`absolute -left-[9px] top-2 h-4 w-4 rounded-full ring-4 ring-white shadow-sm ${levelDot(e.level)}`} 
                    />
                    
                    {/* Karta z wpisem */}
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
                      <button
                        type="button"
                        onClick={() => setOpen((p) => ({ ...p, [e.id]: !isOpen }))}
                        className="flex w-full items-start sm:items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-gray-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-3 mb-1.5">
                            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${levelBadge(e.level)}`}>
                              {e.level === "success" ? "OK" : e.level === "error" ? "Błąd" : "Info"}
                            </span>
                            <span className="truncate text-[14px] font-bold text-gray-900">
                              {e.ruleName}
                            </span>
                          </div>
                          <p className="text-[13px] leading-relaxed text-gray-600 line-clamp-2">
                            {e.message}
                          </p>
                          <p className="mt-1.5 text-[11px] font-semibold text-gray-400 flex items-center gap-1.5">
                            <Clock className="w-3 h-3" /> {fmtTime(e.ts)}
                          </p>
                        </div>
                        <div className="shrink-0 text-gray-400 group-hover:text-blue-500 transition-colors">
                          {isOpen ? (
                            <ChevronDown className="h-5 w-5" strokeWidth={2} />
                          ) : (
                            <ChevronRight className="h-5 w-5" strokeWidth={2} />
                          )}
                        </div>
                      </button>

                      {/* Rozwijane szczegóły (JSON/Error trace) */}
                      {isOpen && e.detail ? (
                        <div className="border-t border-gray-100 p-5 bg-gray-50/50">
                          <pre className="max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white p-4 text-[11px] leading-relaxed text-gray-700 font-mono shadow-inner whitespace-pre-wrap break-words">
                            {e.detail}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

      </div>
    </div>
  );
}