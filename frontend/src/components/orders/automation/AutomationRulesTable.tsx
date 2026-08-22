import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, ClipboardList, Pencil, Trash2 } from "lucide-react";

import type { OrderAutomationRule } from "../../../types/orderAutomation";
import {
  compareRulesByPublicId,
  formatDelayMinutes,
  formatRuleDisplayId,
  formatRuleListName,
} from "../../../utils/orderAutomationPreview";
import type { ConditionOption } from "../../../utils/orderAutomationConditionOptions";
import { formatExecutionListDisplay } from "../../../utils/orderAutomationExecution";
import {
  resolveStatusActionDeepLink,
  statusActionDomainLabel,
  statusNameMapKey,
} from "../../../utils/statusActionDeepLink";
import toast from "react-hot-toast";
import {
  moduleListRowClass,
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListThSortClass,
  moduleListTheadClass,
} from "../../listPage/moduleList";
import { OperationalActionButton, OperationalActionColumn } from "../../operational";
import { StatusBadge } from "@/design-system";
import { AutomationConditionSummary } from "./AutomationConditionSummary";
import { AutomationEffectSummary } from "./AutomationEffectSummary";
import type { OrderUiStatusBriefById } from "./buildOrderUiStatusNameById";

const COLLAPSED_LIMIT = 3;

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

function ConditionsCell({
  rule,
  statusNameById,
  statusBriefById,
  warehouseOptions,
  expanded,
}: {
  rule: OrderAutomationRule;
  statusNameById: Map<number, string>;
  statusBriefById?: OrderUiStatusBriefById;
  warehouseOptions?: ConditionOption[];
  expanded: boolean;
}) {
  const { conditions } = rule;

  if (conditions.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  const visible = expanded ? conditions : conditions.slice(0, COLLAPSED_LIMIT);
  const hidden = expanded ? 0 : Math.max(0, conditions.length - COLLAPSED_LIMIT);

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {visible.map((c) => (
        <AutomationConditionSummary
          key={c.uid}
          condition={c}
          statusNameById={statusNameById}
          statusBriefById={statusBriefById}
          warehouseOptions={warehouseOptions}
          fitToWidth
          truncateText
        />
      ))}
      {hidden > 0 ? (
        <p className="text-xs font-medium text-slate-500">+{hidden} kolejnych warunków</p>
      ) : null}
    </div>
  );
}

function resolveStatusActionLabel(
  rule: OrderAutomationRule,
  statusNameById: Map<number, string>,
  statusNameByKey?: Map<string, string>,
): { label: string; missing: boolean } {
  const sid = rule.triggerStatusId;
  if (sid == null) return { label: "—", missing: true };
  const et = rule.entityType || "ORDER";
  const keyed = statusNameByKey?.get(statusNameMapKey(et, sid));
  if (keyed) return { label: keyed, missing: false };
  // ORDER-only numeric map fallback (conditions / legacy)
  if (et === "ORDER" && statusNameById.get(sid)) {
    return { label: statusNameById.get(sid)!, missing: false };
  }
  return { label: `#${sid}`, missing: true };
}

function EffectsCell({
  rule,
  statusNameById,
  statusNameByKey,
  statusBriefById,
  expanded,
  isStatusAction,
}: {
  rule: OrderAutomationRule;
  statusNameById: Map<number, string>;
  statusNameByKey?: Map<string, string>;
  statusBriefById?: OrderUiStatusBriefById;
  expanded: boolean;
  isStatusAction?: boolean;
}) {
  if (isStatusAction) {
    const n = rule.effects.filter((e) => e.kind).length;
    const { label, missing } = resolveStatusActionLabel(rule, statusNameById, statusNameByKey);
    return (
      <div className="min-w-0 text-sm text-slate-700">
        <p className="font-medium">
          {n} {n === 1 ? "akcja" : n < 5 ? "akcje" : "akcji"}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {statusActionDomainLabel(rule.entityType)} · Po wejściu w status: {label}
        </p>
        {missing ? (
          <p className="mt-0.5 text-[11px] font-medium text-amber-800">Status nie znaleziony — wymaga poprawy</p>
        ) : null}
      </div>
    );
  }
  if (rule.effects.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  const visible = expanded ? rule.effects : rule.effects.slice(0, COLLAPSED_LIMIT);
  const hidden = expanded ? 0 : Math.max(0, rule.effects.length - COLLAPSED_LIMIT);

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {visible.map((e) => (
        <AutomationEffectSummary
          key={e.uid}
          effect={e}
          statusNameById={statusNameById}
          statusBriefById={statusBriefById}
          truncateText
        />
      ))}
      {hidden > 0 ? (
        <p className="text-xs font-medium text-slate-500">+{hidden} kolejnych akcji</p>
      ) : null}
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
  statusNameByKey?: Map<string, string>;
  statusBriefById?: OrderUiStatusBriefById;
  warehouseOptions?: ConditionOption[];
  basePath: string;
  expanded: boolean;
  sourceBadge?: string | null;
  runtimeReady?: boolean;
  onToggleExpand: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onLogs: () => void;
};

function AutomationRuleTableRow({
  rule,
  statusNameById,
  statusNameByKey,
  statusBriefById,
  warehouseOptions,
  basePath,
  expanded,
  sourceBadge,
  runtimeReady = true,
  onToggleExpand,
  onToggle,
  onDelete,
  onLogs,
}: RuleRowProps) {
  const navigate = useNavigate();
  const displayId = formatRuleDisplayId(rule);
  const isStatusAction = (sourceBadge || rule.source || "").toUpperCase() === "STATUS_ACTION" || sourceBadge === "Akcja statusu";
  const { label: statusLabel, missing: statusMissing } = resolveStatusActionLabel(
    rule,
    statusNameById,
    statusNameByKey,
  );
  const ruleName = isStatusAction
    ? rule.name.startsWith("Po wejściu")
      ? rule.name
      : `Po wejściu w status: ${statusLabel}`
    : formatRuleListName(rule);
  const canExpand = !isStatusAction && (rule.conditions.length > COLLAPSED_LIMIT || rule.effects.length > COLLAPSED_LIMIT);

  const openEditor = () => {
    if (isStatusAction) {
      const link = resolveStatusActionDeepLink({
        entityType: rule.entityType,
        triggerStatusId: rule.triggerStatusId,
      });
      if (!link.ok) {
        toast.error(link.message);
        return;
      }
      if (statusMissing) {
        toast.error("Status powiązany z tą akcją nie istnieje — otwieram konfigurator domeny.");
      }
      navigate(link.path);
      return;
    }
    navigate(`${basePath}/${rule.id}/edit`);
  };

  return (
    <tr className={`${moduleListRowClass} ${rule.enabled ? "" : "opacity-55 hover:opacity-100"}`}>
      <td className={`${moduleListTdClass} w-10 text-center`}>
        <label className="inline-flex cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
            checked={rule.enabled}
            onChange={onToggle}
            aria-label={rule.enabled ? "Aktywna" : "Wyłączona"}
          />
        </label>
      </td>
      <td className={`${moduleListTdClass} font-mono text-sm font-semibold tabular-nums text-slate-600`} style={{ width: 80 }}>
        {displayId}
      </td>
      <td className={moduleListTdClass} style={{ width: "16%" }}>
        <button
          type="button"
          className={`block max-w-full text-left text-base font-bold leading-snug hover:underline ${
            rule.enabled ? "text-slate-900" : "text-slate-500 line-through"
          }`}
          title={ruleName}
          onClick={openEditor}
        >
          {ruleName}
        </button>
        {sourceBadge ? (
          <div className="mt-1">
            <StatusBadge tone="primary" density="compact" className="uppercase tracking-wide">
              {sourceBadge}
            </StatusBadge>
          </div>
        ) : null}
        {isStatusAction ? (
          <div className="mt-1">
            <StatusBadge tone="neutral" density="compact" className="uppercase tracking-wide">
              {statusActionDomainLabel(rule.entityType)}
            </StatusBadge>
          </div>
        ) : null}
        {isStatusAction && statusMissing ? (
          <div className="mt-1">
            <StatusBadge tone="warning" density="compact">
              Wymaga poprawy
            </StatusBadge>
          </div>
        ) : null}
        {!isStatusAction ? (
          <div className="mt-1">
            <StatusBadge tone={runtimeReady ? "success" : "warning"} density="compact">
              {runtimeReady ? "Gotowa" : "Wymaga poprawy"}
            </StatusBadge>
          </div>
        ) : null}
        <p className="mt-1.5 text-xs leading-snug text-slate-500">
          Wykonano: <span className="font-semibold tabular-nums text-slate-700">{rule.stats.runCount}</span>
        </p>
        <p className="text-xs leading-snug text-slate-500">Ostatnie: {fmtTime(rule.stats.lastRunAt)}</p>
      </td>
      <td className={moduleListTdClass} style={{ width: "28%" }}>
        {isStatusAction ? (
          <span className="text-xs text-slate-500">Wejście w status panelowy</span>
        ) : (
          <ConditionsCell
            rule={rule}
            statusNameById={statusNameById}
            statusBriefById={statusBriefById}
            warehouseOptions={warehouseOptions}
            expanded={expanded}
          />
        )}
      </td>
      <td className={moduleListTdClass} style={{ width: "28%" }}>
        <EffectsCell
          rule={rule}
          statusNameById={statusNameById}
          statusNameByKey={statusNameByKey}
          statusBriefById={statusBriefById}
          expanded={expanded}
          isStatusAction={isStatusAction}
        />
      </td>
      <td className={`${moduleListTdClass} tabular-nums text-slate-600`} style={{ width: 120 }}>
        {isStatusAction ? "—" : formatDelayMinutes(rule.delayMinutes)}
      </td>
      <td className={moduleListTdClass} style={{ width: 180 }}>
        {isStatusAction ? <span className="text-xs text-slate-500">Automatycznie</span> : <ExecutionCell rule={rule} />}
      </td>
      <td className={moduleListTdClass} style={{ width: 180 }}>
        <OperationalActionColumn
          aria-label="Akcje reguły"
          slots={[
            <OperationalActionButton key="edit" title="Edytuj" aria-label="Edytuj" onClick={openEditor}>
              <Pencil className="text-slate-600" strokeWidth={2} aria-hidden />
            </OperationalActionButton>,
            <OperationalActionButton key="del" variant="danger" title="Usuń" aria-label="Usuń" onClick={onDelete}>
              <Trash2 strokeWidth={2} aria-hidden />
            </OperationalActionButton>,
            <OperationalActionButton
              key="logs"
              title="Historia wykonań"
              aria-label="Historia wykonań"
              onClick={onLogs}
            >
              <ClipboardList className="text-slate-600" strokeWidth={2} aria-hidden />
            </OperationalActionButton>,
            canExpand ? (
              <OperationalActionButton
                key="expand"
                title={expanded ? "Zwiń podgląd" : "Rozwiń podgląd"}
                aria-label={expanded ? "Zwiń podgląd" : "Rozwiń podgląd"}
                aria-expanded={expanded}
                onClick={onToggleExpand}
              >
                {expanded ? (
                  <ChevronUp className="text-slate-600" strokeWidth={2} aria-hidden />
                ) : (
                  <ChevronDown className="text-slate-600" strokeWidth={2} aria-hidden />
                )}
              </OperationalActionButton>
            ) : null,
          ]}
        />
      </td>
    </tr>
  );
}

export type AutomationRulesTableProps = {
  rules: OrderAutomationRule[];
  statusNameById: Map<number, string>;
  /** Cross-domain STATUS_ACTION labels: key = `${entityType}:${statusId}`. */
  statusNameByKey?: Map<string, string>;
  statusBriefById?: OrderUiStatusBriefById;
  warehouseOptions?: ConditionOption[];
  basePath: string;
  idSort: "asc" | "desc";
  onIdSortChange: (dir: "asc" | "desc") => void;
  sourceByRuleId?: Map<string, string>;
  runtimeReadyByRuleId?: Map<string, boolean>;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (rule: OrderAutomationRule) => void;
  onLogs: (rule: OrderAutomationRule) => void;
};

export function AutomationRulesTable({
  rules,
  statusNameById,
  statusNameByKey,
  statusBriefById,
  warehouseOptions,
  basePath,
  idSort,
  onIdSortChange,
  sourceByRuleId,
  runtimeReadyByRuleId,
  onToggle,
  onDelete,
  onLogs,
}: AutomationRulesTableProps) {
  const sorted = [...rules].sort((a, b) => compareRulesByPublicId(a, b, idSort));
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);

  return (
    <div className={moduleListTableScrollClass}>
      <table className={moduleListTableClass} style={{ minWidth: 1180 }}>
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
        <thead className={moduleListTheadClass}>
          <tr>
            <th className={moduleListThClass} aria-label="Aktywna" />
            <th className={moduleListThSortClass}>
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
            <th className={moduleListThClass}>Nazwa</th>
            <th className={moduleListThClass}>Warunki</th>
            <th className={moduleListThClass}>Efekty</th>
            <th className={moduleListThClass}>Opóźnienie</th>
            <th className={moduleListThClass}>Uruchamianie</th>
            <th className={moduleListThClass}>Akcje</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const src = sourceByRuleId?.get(r.id);
            const badge =
              src && src.toUpperCase() === "STATUS_ACTION"
                ? "Akcja statusu"
                : src && src.toUpperCase() === "SYSTEM"
                  ? "System"
                  : null;
            const ready = runtimeReadyByRuleId?.get(r.id) !== false;
            return (
              <AutomationRuleTableRow
                key={r.id}
                rule={r}
                statusNameById={statusNameById}
                statusNameByKey={statusNameByKey}
                statusBriefById={statusBriefById}
                warehouseOptions={warehouseOptions}
                basePath={basePath}
                expanded={expandedRuleId === r.id}
                sourceBadge={badge}
                runtimeReady={ready}
                onToggleExpand={() =>
                  setExpandedRuleId((prev) => (prev === r.id ? null : r.id))
                }
                onToggle={() => onToggle(r.id, !r.enabled)}
                onDelete={() => onDelete(r)}
                onLogs={() => onLogs(r)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
