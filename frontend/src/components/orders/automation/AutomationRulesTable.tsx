import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, ClipboardList, Pencil, Trash2 } from "lucide-react";

import type { AutomationCondition, OrderAutomationRule } from "../../../types/orderAutomation";
import {
  compareRulesByPublicId,
  formatConditionDisplayParts,
  formatDelayMinutes,
  formatEffectsSummary,
  formatExecutionModeBadge,
  formatRuleDisplayId,
  formatRuleWorkflowTitle,
} from "../../../utils/orderAutomationPreview";
import {
  oaListChipClass,
  oaListRowClass,
  oaListTableClass,
  oaListTdClass,
  oaListThClass,
  oaRowActionBtn,
  oaRowActionBtnDanger,
} from "./orderAutomationUiTokens";

const CONDITIONS_PREVIEW = 2;

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function ConditionChip({ c, statusNameById }: { c: AutomationCondition; statusNameById: Map<number, string> }) {
  const parts = formatConditionDisplayParts(c, statusNameById);
  return (
    <span className={oaListChipClass}>
      {parts.field} <span className="font-semibold">{parts.op}</span> {parts.value}
    </span>
  );
}

function ConditionsCell({
  rule,
  statusNameById,
}: {
  rule: OrderAutomationRule;
  statusNameById: Map<number, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const { conditions } = rule;

  if (conditions.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  const visible = expanded ? conditions : conditions.slice(0, CONDITIONS_PREVIEW);
  const hidden = conditions.length - CONDITIONS_PREVIEW;

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {visible.map((c, i) => {
        const globalIdx = expanded ? i : i;
        const join =
          globalIdx > 0
            ? (conditions[globalIdx - 1]?.joinToNext === "or" ? "LUB" : "ORAZ")
            : null;
        return (
          <div key={c.uid} className="flex min-w-0 flex-col gap-0.5">
            {join ? (
              <span className="text-[10px] font-bold uppercase leading-none text-slate-400">{join}</span>
            ) : null}
            <ConditionChip c={c} statusNameById={statusNameById} />
          </div>
        );
      })}
      {!expanded && hidden > 0 ? (
        <button
          type="button"
          className="mt-0.5 w-fit text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:underline"
          onClick={() => setExpanded(true)}
        >
          +{hidden} więcej
        </button>
      ) : null}
      {expanded && conditions.length > CONDITIONS_PREVIEW ? (
        <button
          type="button"
          className="mt-0.5 w-fit text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:underline"
          onClick={() => setExpanded(false)}
        >
          Zwiń
        </button>
      ) : null}
    </div>
  );
}

function EffectsCell({
  rule,
  statusNameById,
}: {
  rule: OrderAutomationRule;
  statusNameById: Map<number, string>;
}) {
  const { short, full } = formatEffectsSummary(rule.effects, statusNameById);

  if (rule.effects.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  if (rule.effects.length === 1) {
    return <span className={oaListChipClass}>{short}</span>;
  }

  return (
    <span className={oaListChipClass} title={full}>
      {short}
    </span>
  );
}

type RuleRowProps = {
  rule: OrderAutomationRule;
  statusNameById: Map<number, string>;
  basePath: string;
  onToggle: () => void;
  onDelete: () => void;
  onLogs: () => void;
};

function AutomationRuleTableRow({ rule, statusNameById, basePath, onToggle, onDelete, onLogs }: RuleRowProps) {
  const navigate = useNavigate();
  const displayId = formatRuleDisplayId(rule);
  const workflowTitle = formatRuleWorkflowTitle(rule, statusNameById);
  const primaryTitle = workflowTitle !== "—" ? workflowTitle : rule.name;
  const execBadge = formatExecutionModeBadge(rule);

  return (
    <tr
      className={`${oaListRowClass} ${rule.enabled ? "" : "opacity-55 hover:opacity-100"}`}
    >
      <td className={`${oaListTdClass} w-10 text-center`}>
        <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
            checked={rule.enabled}
            onChange={onToggle}
            aria-label={rule.enabled ? "Aktywna" : "Wyłączona"}
          />
        </label>
      </td>
      <td className={`${oaListTdClass} w-20 font-mono text-xs font-semibold tabular-nums text-slate-600`}>
        {displayId}
      </td>
      <td className={`${oaListTdClass} min-w-[11rem]`}>
        <button
          type="button"
          className={`block max-w-full truncate text-left text-sm font-bold leading-tight hover:underline ${
            rule.enabled ? "text-slate-900" : "text-slate-500 line-through"
          }`}
          title={primaryTitle}
          onClick={() => navigate(`${basePath}/${rule.id}/edit`)}
        >
          {primaryTitle}
        </button>
        <p className="mt-0.5 truncate text-[11px] leading-tight text-slate-500">
          Wykonano: <span className="font-semibold tabular-nums text-slate-700">{rule.stats.runCount}</span>
          <span className="mx-1 text-slate-300">·</span>
          Ostatnie: {fmtTime(rule.stats.lastRunAt)}
        </p>
      </td>
      <td className={`${oaListTdClass} min-w-[10rem] max-w-[14rem]`}>
        <ConditionsCell rule={rule} statusNameById={statusNameById} />
      </td>
      <td className={`${oaListTdClass} min-w-[9rem] max-w-[12rem]`}>
        <EffectsCell rule={rule} statusNameById={statusNameById} />
      </td>
      <td className={`${oaListTdClass} w-20 tabular-nums text-slate-600`}>
        {formatDelayMinutes(rule.delayMinutes)}
      </td>
      <td className={`${oaListTdClass} w-28`}>
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium leading-tight ${execBadge.className}`}>
          {execBadge.label}
        </span>
      </td>
      <td className={`${oaListTdClass} w-32`}>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className={oaRowActionBtn}
            title="Edytuj"
            aria-label="Edytuj"
            onClick={() => navigate(`${basePath}/${rule.id}/edit`)}
          >
            <Pencil className="h-4 w-4" strokeWidth={2} />
          </button>
          <button type="button" className={oaRowActionBtnDanger} title="Usuń" aria-label="Usuń" onClick={onDelete}>
            <Trash2 className="h-4 w-4" strokeWidth={2} />
          </button>
          <button type="button" className={oaRowActionBtn} title="Dziennik wykonań" aria-label="Dziennik wykonań" onClick={onLogs}>
            <ClipboardList className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export type AutomationRulesTableProps = {
  rules: OrderAutomationRule[];
  statusNameById: Map<number, string>;
  basePath: string;
  idSort: "asc" | "desc";
  onIdSortChange: (dir: "asc" | "desc") => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (rule: OrderAutomationRule) => void;
  onLogs: (rule: OrderAutomationRule) => void;
};

export function AutomationRulesTable({
  rules,
  statusNameById,
  basePath,
  idSort,
  onIdSortChange,
  onToggle,
  onDelete,
  onLogs,
}: AutomationRulesTableProps) {
  const sorted = [...rules].sort((a, b) => compareRulesByPublicId(a, b, idSort));

  return (
    <div className="overflow-x-auto">
      <table className={oaListTableClass}>
        <colgroup>
          <col className="w-10" />
          <col className="w-20" />
          <col className="w-[18%]" />
          <col className="w-[20%]" />
          <col className="w-[16%]" />
          <col className="w-20" />
          <col className="w-28" />
          <col className="w-32" />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 bg-white">
            <th className={oaListThClass} aria-label="Aktywna" />
            <th className={`${oaListThClass} w-20`}>
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-slate-800"
                onClick={() => onIdSortChange(idSort === "asc" ? "desc" : "asc")}
              >
                ID
                {idSort === "asc" ? (
                  <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                )}
              </button>
            </th>
            <th className={oaListThClass}>Nazwa</th>
            <th className={oaListThClass}>Warunki</th>
            <th className={oaListThClass}>Efekty</th>
            <th className={oaListThClass}>Opóźnienie</th>
            <th className={oaListThClass}>Uruchamianie</th>
            <th className={oaListThClass}>Akcje</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <AutomationRuleTableRow
              key={r.id}
              rule={r}
              statusNameById={statusNameById}
              basePath={basePath}
              onToggle={() => onToggle(r.id, !r.enabled)}
              onDelete={() => onDelete(r)}
              onLogs={() => onLogs(r)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
