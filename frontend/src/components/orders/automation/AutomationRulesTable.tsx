import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, ClipboardList, Pencil, Trash2 } from "lucide-react";

import type { OrderAutomationRule } from "../../../types/orderAutomation";
import {
  compareRulesByPublicId,
  formatConditionListLine,
  formatDelayMinutes,
  formatEffectListBlock,
  formatExecutionModeBadge,
  formatRuleDisplayId,
  formatRuleListName,
  formatRuleTriggerLabels,
} from "../../../utils/orderAutomationPreview";
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

function ConditionsCell({
  rule,
  statusNameById,
}: {
  rule: OrderAutomationRule;
  statusNameById: Map<number, string>;
}) {
  const { conditions } = rule;

  if (conditions.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {conditions.map((c, i) => {
        const line = formatConditionListLine(c, statusNameById);
        const join =
          i > 0 ? (conditions[i - 1]?.joinToNext === "or" ? "LUB" : "ORAZ") : null;
        return (
          <div key={c.uid} className="flex min-w-0 flex-col gap-1.5">
            {join ? <span className={oaListJoinBadgeClass}>{join}</span> : null}
            <p className={`${oaListLogicLineClass} break-words`}>
              {line.field}{" "}
              <span className="font-bold">
                {line.operator} {line.value}
              </span>
            </p>
          </div>
        );
      })}
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
  if (rule.effects.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {rule.effects.map((e) => {
        const block = formatEffectListBlock(e, statusNameById);
        const hasDetail = block.primaryBold || block.secondaryDetail;
        return (
          <div key={e.uid} className="min-w-0">
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
      })}
    </div>
  );
}

function ExecutionCell({ rule }: { rule: OrderAutomationRule }) {
  const triggers = formatRuleTriggerLabels(rule);
  const modeBadge = formatExecutionModeBadge(rule);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {triggers.length > 0 ? (
        <ul className="space-y-0.5">
          {triggers.map((t) => (
            <li key={t} className="text-xs leading-snug text-slate-700">
              {t}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-slate-400">—</span>
      )}
      <span
        className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-[11px] font-medium leading-tight ${modeBadge.className}`}
      >
        {modeBadge.label}
      </span>
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
      <td className={`${oaListTdClass} w-20 font-mono text-sm font-semibold tabular-nums text-slate-600`}>
        {displayId}
      </td>
      <td className={oaListTdClass}>
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
          <span className="mx-1.5 text-slate-300">•</span>
          Ostatnie: {fmtTime(rule.stats.lastRunAt)}
        </p>
      </td>
      <td className={oaListTdClass}>
        <ConditionsCell rule={rule} statusNameById={statusNameById} />
      </td>
      <td className={oaListTdClass}>
        <EffectsCell rule={rule} statusNameById={statusNameById} />
      </td>
      <td className={`${oaListTdClass} w-24 tabular-nums text-slate-600`}>
        {formatDelayMinutes(rule.delayMinutes)}
      </td>
      <td className={`${oaListTdClass} w-36`}>
        <ExecutionCell rule={rule} />
      </td>
      <td className={`${oaListTdClass} w-36`}>
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
          <col className="w-20" />
          <col style={{ width: "14%" }} />
          <col style={{ width: "30%" }} />
          <col style={{ width: "30%" }} />
          <col className="w-24" />
          <col className="w-36" />
          <col className="w-36" />
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
