import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";

import { flatSectionDividerClass } from "../../components/layout/flatSectionTokens";
import {
  moduleListEmptyStateClass,
  moduleListRowClass,
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
} from "../../components/listPage/moduleList";
import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { useOrderAutomationStore } from "../../hooks/useOrderAutomationStore";
import type { OrderAutomationLogEntry } from "../../types/orderAutomation";
import { oaBtnDanger } from "../../components/orders/automation/orderAutomationUiTokens";

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "medium" });
  } catch {
    return iso;
  }
}

function levelLabel(level: OrderAutomationLogEntry["level"]) {
  if (level === "success") return "OK";
  if (level === "error") return "Błąd";
  return "Info";
}

function levelTextClass(level: OrderAutomationLogEntry["level"]) {
  if (level === "success") return "text-emerald-700";
  if (level === "error") return "text-red-700";
  return "text-slate-700";
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
    return <p className="pt-6 text-sm text-slate-600">Wybierz magazyn w nagłówku aplikacji.</p>;
  }

  if (!canWrite) {
    return (
      <p className="pt-6 text-sm text-slate-600">
        Brak uprawnienia <span className="font-mono text-[11px]">settings.automation</span>.
      </p>
    );
  }

  return (
    <div className="pt-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-slate-900">Dziennik wykonań</h2>
          <p className="mt-1 text-sm text-slate-500">Ostatnie uruchomienia i testy (do 500 wpisów) · {sorted.length} wpisów</p>
        </div>
        <button
          type="button"
          className={`${oaBtnDanger} gap-2`}
          onClick={() => {
            if (!window.confirm("Wyczyścić cały dziennik dla tego magazynu?")) return;
            clearLogs();
          }}
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
          Wyczyść dziennik
        </button>
      </div>
      <div className={`${flatSectionDividerClass} mb-6`} aria-hidden />

      {sorted.length === 0 ? (
        <div className="py-10">
          <p className="text-sm font-medium text-slate-800">Brak wpisów w dzienniku</p>
          <p className="mt-1 text-sm text-slate-500">Uruchom test z listy reguł lub z edytora — wpisy pojawią się tutaj.</p>
        </div>
      ) : (
        <div className={moduleListTableScrollClass}>
          <table className={moduleListTableClass}>
            <thead className={moduleListTheadClass}>
              <tr>
                <th className={`${moduleListThClass} w-10`} />
                <th className={moduleListThClass}>Data</th>
                <th className={moduleListThClass}>Poziom</th>
                <th className={moduleListThClass}>Akcja</th>
                <th className={moduleListThClass}>Komunikat</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => {
                const isOpen = open[e.id] ?? false;
                return (
                  <Fragment key={e.id}>
                    <tr key={e.id} className={moduleListRowClass}>
                      <td className={moduleListTdClass}>
                        {e.detail ? (
                          <button
                            type="button"
                            className="text-slate-400 hover:text-slate-700"
                            aria-expanded={isOpen}
                            onClick={() => setOpen((p) => ({ ...p, [e.id]: !isOpen }))}
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        ) : null}
                      </td>
                      <td className={`${moduleListTdClass} whitespace-nowrap text-slate-600`}>{fmtTime(e.ts)}</td>
                      <td className={`${moduleListTdClass} text-xs font-medium ${levelTextClass(e.level)}`}>{levelLabel(e.level)}</td>
                      <td className={`${moduleListTdClass} font-medium text-slate-900`}>{e.ruleName}</td>
                      <td className={`${moduleListTdClass} text-slate-600`}>{e.message}</td>
                    </tr>
                    {isOpen && e.detail ? (
                      <tr key={`${e.id}-detail`} className="bg-slate-50/50">
                        <td colSpan={5} className="px-4 py-3">
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-slate-700">{e.detail}</pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
