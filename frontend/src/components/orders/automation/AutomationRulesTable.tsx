import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, ClipboardList, Pencil, Trash2 } from "lucide-react";

import type { AutomationCondition, AutomationEffect, OrderAutomationRule } from "../../../types/orderAutomation";
import {
  compareRulesByPublicId,
  formatConditionListLine,
  formatDelayMinutes,
  formatEffectListBlock,
  formatRuleDisplayId,
  formatRuleListName,
} from "../../../utils/orderAutomationPreview";
import { formatExecutionListDisplay } from "../../../utils/orderAutomationExecution";
import {
  oaListJoinBadgeClass,
  oaListLogicLineClass,
  oaListRowClass,
  oaListTableClass,
  oaListTdClass,
  oaListThClass,
  oaRowActionBtn,
  oaRowActionBtnDanger,
} from "./orderAutomationUiTokens";

const MAX_VISIBLE_CONDITIONS = 3;
const MAX_VISIBLE_EFFECTS = 2;

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

function ConditionLine({
  c,
  join,
  statusNameById,
}: {
  c: AutomationCondition;
  join: string | null;
  statusNameById: Map<number, string>;
}) {
  const line = formatConditionListLine(c, statusNameById);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {join ? <span className={oaListJoinBadgeClass}>{join}</span> : null}
      <p className={`${oaListLogicLineClass} break-words`}>
        {line.field}{" "}
        <span className="font-bold">
          {line.operator} {line.value}
        </span>
      </p>
    </div>
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

  const hiddenCount = Math.max(0, conditions.length - MAX_VISIBLE_CONDITIONS);
  const visible = expanded ? conditions : conditions.slice(0, MAX_VISIBLE_CONDITIONS);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {visible.map((c, i) => {
        const globalIdx = expanded ? i : i;
        const join =
          globalIdx > 0 ? (conditions[globalIdx - 1]?.joinToNext === "or" ? "LUB" : "ORAZ") : null;
        return <ConditionLine key={c.uid} c={c} join={join} statusNameById={statusNameById} />;
      })}
      {hiddenCount > 0 && !expanded ? (
        <button
          type="button"
          className="w-fit text-left text-xs font-medium text-blue-700 hover:underline"
          onClick={() => setExpanded(true)}
        >
          +{hiddenCount} więcej
        </button>
      ) : null}
      {expanded && conditions.length > MAX_VISIBLE_CONDITIONS ? (
        <button
          type="button"
          className="w-fit text-left text-xs font-medium text-blue-700 hover:underline"
          onClick={() => setExpanded(false)}
        >
          Pokaż mniej
        </button>
      ) : null}
    </div>
  );
}

function EffectBlock({
  e,
  statusNameById,
}: {
  e: AutomationEffect;
  statusNameById: Map<number, string>;
}) {
  const block = formatEffectListBlock(e, statusNameById);
  const hasDetail = block.primaryBold || block.secondaryDetail;
  return (
    <div className="min-w-0">
      <p className={`${oaListLogicLineClass} font-medium text-slate-900`}>{block.title}</p>
      {hasDetail ? (
        <p className={`${oaListLogicLineClass} mt-0.5 break-words text-slate-700`}>
          {block.detailPrefix}
          {block.primaryBold ? <span className="font-bold">{block.primaryBold}</span> : null}
          {block.secondaryDetail}
        </p>
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
  const [expanded, setExpanded] = useState(false);

  if (rule.effects.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  const hiddenCount = Math.max(0, rule.effects.length - MAX_VISIBLE_EFFECTS);
  const visible = expanded ? rule.effects : rule.effects.slice(0, MAX_VISIBLE_EFFECTS);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {visible.map((e) => (
        <EffectBlock key={e.uid} e={e} statusNameById={statusNameById} />
      ))}
      {hiddenCount > 0 && !expanded ? (
        <button
          type="button"
          className="w-fit text-left text-xs font-medium text-blue-700 hover:underline"
          onClick={() => setExpanded(true)}
        >
          +{hiddenCount} kolejne akcje
        </button>
      ) : null}
      {expanded && rule.effects.length > MAX_VISIBLE_EFFECTS ? (
        <button
          type="button"
          className="w-fit text-left text-xs font-medium text-blue-700 hover:underline"
          onClick={() => setExpanded(false)}
        >
          Pokaż mniej
        </button>
      ) : null}
    </div>
  );
}

function ExecutionCell({ rule }: { rule: OrderAutomationRule }) {
  const { lines, variant } = formatExecutionListDisplay(rule);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {lines.map((line, i) => (
        <p
          key={`${line}-${i}`}
          className={`text-sm leading-snug ${
            i === 0 && variant === "automatic" && rule.enabled
              ? "font-medium text-emerald-800"
              : i === 0 && variant === "manual"
                ? "font-medium text-slate-700"
                : "text-slate-600"
          }`}
        >
          {line}
        </p>
      ))}
    </div>
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
  const ruleName = formatRuleListName(rule);

  return (
    <tr className={`${oaListRowClass} ${rule.enabled ? "" : "opacity-55 hover:opacity-100"}`}>
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
      <td className={`${oaListTdClass} font-mono text-sm font-semibold tabular-nums text-slate-600`} style={{ width: 80 }}>
        {displayId}
      </td>
      <td className={oaListTdClass} style={{ width: "16%" }}>
        <button
          type="button"
          className={`block max-w-full text-left text-base font-bold leading-snug hover:underline ${
            rule.enabled ? "text-slate-900" : "text-slate-500 line-through"
          }`}
          title={ruleName}
          onClick={() => navigate(`${basePath}/${rule.id}/edit`)}
        >
          {ruleName}
        </button>
        <p className="mt-1.5 text-xs leading-snug text-slate-500">
          Wykonano: <span className="font-semibold tabular-nums text-slate-700">{rule.stats.runCount}</span>
        </p>
        <p className="text-xs leading-snug text-slate-500">Ostatnie: {fmtTime(rule.stats.lastRunAt)}</p>
      </td>
      <td className={oaListTdClass} style={{ width: "28%" }}>
        <ConditionsCell rule={rule} statusNameById={statusNameById} />
      </td>
      <td className={oaListTdClass} style={{ width: "28%" }}>
        <EffectsCell rule={rule} statusNameById={statusNameById} />
      </td>
      <td className={`${oaListTdClass} tabular-nums text-slate-600`} style={{ width: 120 }}>
        {formatDelayMinutes(rule.delayMinutes)}
      </td>
      <td className={oaListTdClass} style={{ width: 180 }}>
        <ExecutionCell rule={rule} />
      </td>
      <td className={oaListTdClass} style={{ width: 180 }}>
        <div className="flex items-start gap-1">
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
          <button
            type="button"
            className={oaRowActionBtn}
            title="Dziennik wykonań"
            aria-label="Dziennik wykonań"
            onClick={onLogs}
          >
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
          <col style={{ width: 80 }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "28%" }} />
          <col style={{ width: "28%" }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 180 }} />
          <col style={{ width: 180 }} />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 bg-white">
            <th className={oaListThClass} aria-label="Aktywna" />
            <th className={oaListThClass}>
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
