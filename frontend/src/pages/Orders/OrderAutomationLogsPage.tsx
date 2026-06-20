import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Trash2, X } from "lucide-react";

import { moduleAutomationShellClass } from "../../components/layout/flatSectionTokens";
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
import { formatRuleDisplayId, formatRuleWorkflowTitle } from "../../utils/orderAutomationPreview";
import { oaBtn, oaBtnDanger } from "../../components/orders/automation/orderAutomationUiTokens";

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
  const { logs, rules, reload, clearLogs } = useOrderAutomationStore(DAMAGE_TENANT_ID, wid);
  const [searchParams, setSearchParams] = useSearchParams();

  const ruleIdFilter = searchParams.get("ruleId");
  const publicIdFilter = searchParams.get("publicId");

  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredRule = useMemo(() => {
    if (!ruleIdFilter) return null;
    return rules.find((r) => r.id === ruleIdFilter) ?? null;
  }, [rules, ruleIdFilter]);

  const filtered = useMemo(() => {
    let list = [...logs];
    if (ruleIdFilter) {
      list = list.filter((e) => e.ruleId === ruleIdFilter);
    }
    return list.sort((a, b) => b.ts.localeCompare(a.ts));
  }, [logs, ruleIdFilter]);

  const filterLabel = useMemo(() => {
    if (!ruleIdFilter) return null;
    if (filteredRule) {
      const title = formatRuleWorkflowTitle(filteredRule);
      const id = formatRuleDisplayId(filteredRule);
      return title !== "—" ? `${title} (ID ${id})` : `${filteredRule.name} (ID ${id})`;
    }
    if (publicIdFilter) return `Reguła ID #${publicIdFilter}`;
    return "Wybrana reguła";
  }, [filteredRule, publicIdFilter, ruleIdFilter]);

  const clearRuleFilter = () => {
    setSearchParams({});
  };

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
    <div className={`${moduleAutomationShellClass} w-full max-w-none`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="min-w-0">
          {ruleIdFilter ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-700">
                Dziennik dla: <span className="font-semibold text-slate-900">{filterLabel}</span>
              </p>
              <button type="button" className={`${oaBtn} h-8 gap-1.5 px-2.5 text-xs`} onClick={clearRuleFilter}>
                <X className="h-3.5 w-3.5" strokeWidth={2} />
                Pokaż wszystkie
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Ostatnie uruchomienia i testy (do 500 wpisów) · {filtered.length} wpisów</p>
          )}
        </div>
        {!ruleIdFilter ? (
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
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="py-10">
          <p className="text-sm font-medium text-slate-800">
            {ruleIdFilter ? "Brak wpisów dla tej reguły" : "Brak wpisów w dzienniku"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {ruleIdFilter
              ? "Reguła nie była jeszcze uruchomiona lub nie ma zapisanych testów."
              : "Uruchom test z edytora — wpisy pojawią się tutaj."}
          </p>
          {ruleIdFilter ? (
            <Link to="/orders/automation/logs" className={`${oaBtn} mt-4 inline-flex`}>
              Pokaż cały dziennik
            </Link>
          ) : null}
        </div>
      ) : (
        <div className={moduleListTableScrollClass}>
          <table className={moduleListTableClass}>
            <thead className={moduleListTheadClass}>
              <tr>
                <th className={`${moduleListThClass} w-10`} />
                <th className={moduleListThClass}>Data</th>
                <th className={moduleListThClass}>Poziom</th>
                {!ruleIdFilter ? <th className={moduleListThClass}>Akcja</th> : null}
                <th className={moduleListThClass}>Komunikat</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const isOpen = open[e.id] ?? false;
                const colSpan = ruleIdFilter ? 4 : 5;
                return (
                  <Fragment key={e.id}>
                    <tr className={moduleListRowClass}>
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
                      {!ruleIdFilter ? (
                        <td className={`${moduleListTdClass} font-medium text-slate-900`}>{e.ruleName}</td>
                      ) : null}
                      <td className={`${moduleListTdClass} text-slate-600`}>{e.message}</td>
                    </tr>
                    {isOpen && e.detail ? (
                      <tr>
                        <td colSpan={colSpan} className="border-t border-slate-100 px-4 py-3">
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700">{e.detail}</pre>
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
