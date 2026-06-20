import { useMemo, useState } from "react";

import type { OrderAutomationChangeLogEntry, OrderAutomationExecutionLogEntry } from "../../../types/orderAutomation";
import { flatSectionDividerClass } from "../../layout/flatSectionTokens";
import { AutomationChangeLogDiffView } from "./AutomationChangeLogDiffView";

type TabId = "changes" | "executions";

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    return `${y}-${mo}-${day} ${h}:${mi}:${s}`;
  } catch {
    return iso;
  }
}

function ChangeLogList({ entries }: { entries: OrderAutomationChangeLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-6 text-sm text-slate-500">
        Brak wpisów historii zmian. Zapisz regułę, aby rejestrować modyfikacje konfiguracji.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {entries.map((e) => (
        <li key={e.id} className="py-4 first:pt-0">
          <p className="text-sm font-medium tabular-nums text-slate-900">{fmtDateTime(e.createdAt)}</p>
          <p className="mt-0.5 text-sm text-slate-700">{e.userName}</p>
          <div className="mt-3 text-sm">
            <p className="text-slate-500">Zmiana:</p>
            <p className="mt-0.5 font-medium text-slate-900">{e.field}</p>
            <AutomationChangeLogDiffView entry={e} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ExecutionLogList({ entries }: { entries: OrderAutomationExecutionLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-6 text-sm text-slate-500">
        Brak uruchomień. Historia wykonań pojawi się po automatycznym lub ręcznym uruchomieniu reguły na zamówieniu.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {entries.map((e) => (
        <li key={e.id} className="py-4 first:pt-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium tabular-nums text-slate-900">{fmtDateTime(e.ts)}</p>
            <span
              className={`text-xs font-medium ${
                e.level === "success" ? "text-emerald-700" : e.level === "error" ? "text-red-700" : "text-slate-600"
              }`}
            >
              {e.kind === "test" ? "Test" : "Wykonanie"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-800">{e.message}</p>
          {e.orderId ? <p className="mt-1 text-xs text-slate-500">Zamówienie: {e.orderId}</p> : null}
          {e.effectsExecuted && e.effectsExecuted.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
              {e.effectsExecuted.map((fx) => (
                <li key={fx}>{fx}</li>
              ))}
            </ul>
          ) : null}
          {e.detail ? (
            <pre className="mt-2 max-h-32 overflow-auto rounded-lg border border-slate-200 bg-white p-2 font-mono text-xs text-slate-600">
              {e.detail}
            </pre>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

type Props = {
  ruleId: string;
  changeLogs: OrderAutomationChangeLogEntry[];
  executionLogs: OrderAutomationExecutionLogEntry[];
};

export function AutomationRuleHistoryPanel({ ruleId, changeLogs, executionLogs }: Props) {
  const [tab, setTab] = useState<TabId>("changes");

  const ruleChanges = useMemo(
    () => changeLogs.filter((e) => e.ruleId === ruleId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [changeLogs, ruleId],
  );
  const ruleExecutions = useMemo(
    () => executionLogs.filter((e) => e.ruleId === ruleId).sort((a, b) => b.ts.localeCompare(a.ts)),
    [executionLogs, ruleId],
  );

  return (
    <section className="w-full space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Historia</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Zmiany konfiguracji reguły oraz uruchomienia na zamówieniach są rejestrowane oddzielnie.
        </p>
      </div>
      <div className={flatSectionDividerClass} aria-hidden />

      <div className="flex gap-6 border-b border-slate-200">
        <button
          type="button"
          className={`border-b-2 pb-2 text-sm font-medium transition ${
            tab === "changes"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
          onClick={() => setTab("changes")}
        >
          Historia zmian
        </button>
        <button
          type="button"
          className={`border-b-2 pb-2 text-sm font-medium transition ${
            tab === "executions"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
          onClick={() => setTab("executions")}
        >
          Historia wykonań
        </button>
      </div>

      {tab === "changes" ? <ChangeLogList entries={ruleChanges} /> : <ExecutionLogList entries={ruleExecutions} />}
    </section>
  );
}
