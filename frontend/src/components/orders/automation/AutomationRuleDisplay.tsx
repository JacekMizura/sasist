import { useState } from "react";

import type { AutomationCondition, AutomationEffect } from "../../../types/orderAutomation";
import {
  formatConditionDisplayParts,
  formatEffectListBlock,
} from "../../../utils/orderAutomationPreview";
import type { ConditionOption } from "../../../utils/orderAutomationConditionOptions";
import { oaListLogicLineClass } from "./orderAutomationUiTokens";

const MULTI_VALUE_VISIBLE = 5;

type ConditionDisplayProps = {
  condition: AutomationCondition;
  statusNameById?: Map<number, string>;
  warehouseOptions?: ConditionOption[];
  /** Klasa linii bazowej (domyślnie lista) */
  lineClassName?: string;
};

export function AutomationConditionDisplay({
  condition,
  statusNameById,
  warehouseOptions,
  lineClassName = oaListLogicLineClass,
}: ConditionDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const parts = formatConditionDisplayParts(condition, statusNameById, warehouseOptions);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  if (parts.useValueList) {
    const labels = parts.valueLabels;
    const visible = expanded ? labels : labels.slice(0, MULTI_VALUE_VISIBLE);
    const hiddenCount = labels.length - visible.length;

    return (
      <div className={`min-w-0 ${lineClassName}`}>
        <p className="break-words">
          <span className="text-slate-900">{parts.field}</span>{" "}
          <span className="text-slate-500">{parts.op}</span>
        </p>
        <ul className="mt-1 space-y-0.5 pl-0.5">
          {visible.map((label) => (
            <li key={label} className="flex min-w-0 items-start gap-1.5">
              <span className="shrink-0 text-slate-400" aria-hidden>
                •
              </span>
              <span className="min-w-0 font-semibold text-slate-900">{label}</span>
            </li>
          ))}
        </ul>
        {hiddenCount > 0 && !expanded ? (
          <button
            type="button"
            className="mt-1 text-xs font-medium text-blue-700 hover:underline"
            onClick={(e) => {
              stop(e);
              setExpanded(true);
            }}
          >
            + {hiddenCount} kolejnych
          </button>
        ) : null}
        {expanded && labels.length > MULTI_VALUE_VISIBLE ? (
          <button
            type="button"
            className="mt-1 text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline"
            onClick={(e) => {
              stop(e);
              setExpanded(false);
            }}
          >
            Zwiń
          </button>
        ) : null}
      </div>
    );
  }

  const primary = parts.valueLabels[0] ?? parts.value;

  return (
    <p className={`min-w-0 break-words ${lineClassName}`}>
      <span className="text-slate-900">{parts.field}</span>{" "}
      <span className="text-slate-500">{parts.op}</span>{" "}
      <span className="font-semibold text-slate-900">{primary}</span>
    </p>
  );
}

type EffectDisplayProps = {
  effect: AutomationEffect;
  statusNameById?: Map<number, string>;
  lineClassName?: string;
};

export function AutomationEffectDisplay({
  effect,
  statusNameById,
  lineClassName = oaListLogicLineClass,
}: EffectDisplayProps) {
  const block = formatEffectListBlock(effect, statusNameById);

  return (
    <div className={`min-w-0 ${lineClassName}`}>
      <p className="break-words text-slate-900">
        {block.leadIn}
        {block.primaryBold ? <span className="font-semibold text-slate-900">{block.primaryBold}</span> : null}
      </p>
      {block.secondaryDetail ? (
        <p className="mt-0.5 break-words text-sm text-slate-600">{block.secondaryDetail}</p>
      ) : null}
    </div>
  );
}
