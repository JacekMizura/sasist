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
import type { ConditionOption } from "../../../utils/orderAutomationConditionOptions";
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

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${mo}-${day} ${h}:${mi}`;
  } catch {
    return iso;
  }
}

function ConditionLine({
  c,
  join,
  statusNameById,
  warehouseOptions,
}: {
  c: AutomationCondition;
  join: string | null;
  statusNameById: Map<number, string>;
  warehouseOptions?: ConditionOption[];
}) {
  const line = formatConditionListLine(c, statusNameById, warehouseOptions);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {join ? <span className={oaListJoinBadgeClass}>{join}</span> : null}
      <p className={`${oaListLogicLineClass} break-words`}>
        {line.field} {line.operator}{" "}
        <span className="font-semibold">{line.value}</span>
      </p>
    </div>
  );
}

function ConditionsCell({
  rule,
  statusNameById,
  warehouseOptions,
}: {
  rule: OrderAutomationRule;
  statusNameById: Map<number, string>;
  warehouseOptions?: ConditionOption[];
}) {
  const { conditions } = rule;

  if (conditions.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {conditions.map((c, i) => {
        const join = i > 0 ? (conditions[i - 1]?.joinToNext === "or" ? "LUB" : "ORAZ") : null;
        return <ConditionLine key={c.uid} c={c} join={join} statusNameById={statusNameById} warehouseOptions={warehouseOptions} />;
      })}
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
          {block.primaryBold ? <span className="font-semibold">{block.primaryBold}</span> : null}
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
  if (rule.effects.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {rule.effects.map((e) => (
        <EffectBlock key={e.uid} e={e} statusNameById={statusNameById} />
      ))}
    </div>
  );
}

function ExecutionCell({ rule }: { rule: OrderAutomationRule }) {
  const { badges } = formatExecutionListDisplay(rule);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {badges.map((badge) => (
        <span
          key={badge.key}
          className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium leading-snug ${badge.className}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

type RuleRowProps = {
  rule: OrderAutomationRule;
  statusNameById: Map<number, string>;
  warehouseOptions?: ConditionOption[];
  basePath: string;
  onToggle: () => void;
  onDelete: () => void;
  onLogs: () => void;
};

function AutomationRuleTableRow({ rule, statusNameById, warehouseOptions, basePath, onToggle, onDelete, onLogs }: RuleRowProps) {
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
        <ConditionsCell rule={rule} statusNameById={statusNameById} warehouseOptions={warehouseOptions} />
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
            title="Historia wykonań"
            aria-label="Historia wykonań"
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
  warehouseOptions?: ConditionOption[];
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
  warehouseOptions,
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
              warehouseOptions={warehouseOptions}
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
